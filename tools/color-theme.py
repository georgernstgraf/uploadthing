#!/usr/bin/env python3
"""
Color Theme Generator for Bootstrap 5

Analyzes background images to extract dominant colors and generates
complete Bootstrap 5 CSS variable overrides for light and dark modes.
"""

import argparse
import sys
from pathlib import Path

# Image processing
from PIL import Image, ImageFilter

# Color extraction
from colorthief import ColorThief

# Color manipulation
import colorsys
from colormath.color_objects import sRGBColor, LabColor
from colormath.color_conversions import convert_color
from colormath.color_diff import delta_e_cie2000

# WCAG contrast
from wcag_contrast_ratio import contrast as wcag_contrast


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    """Convert RGB tuple to hex color."""
    return '#{:02x}{:02x}{:02x}'.format(*rgb)


def rgb_to_hsl(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """Convert RGB to HSL."""
    r, g, b = [x / 255.0 for x in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360, s * 100, l * 100)


def get_luminance(rgb: tuple[int, int, int]) -> float:
    """Calculate relative luminance of a color."""
    r, g, b = [x / 255.0 for x in rgb]
    r = r / 12.92 if r <= 0.03928 else ((r + 0.055) / 1.055) ** 2.4
    g = g / 12.92 if g <= 0.03928 else ((g + 0.055) / 1.055) ** 2.4
    b = b / 12.92 if b <= 0.03928 else ((b + 0.055) / 1.055) ** 2.4
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def wcag_contrast_ratio(color1: tuple[int, int, int], color2: tuple[int, int, int]) -> float:
    """Calculate WCAG contrast ratio between two colors."""
    lum1 = get_luminance(color1)
    lum2 = get_luminance(color2)
    lighter = max(lum1, lum2)
    darker = min(lum1, lum2)
    return (lighter + 0.05) / (darker + 0.05)


def find_contrast_color(base_rgb: tuple[int, int, int], target_ratio: float, dark_bg: bool) -> tuple[int, int, int]:
    """Find a color that meets WCAG contrast requirements."""
    h, s, l = rgb_to_hsl(base_rgb)
    
    # Adjust lightness until we meet contrast requirement
    if dark_bg:
        # Need lighter text on dark background
        test_l = l
        while test_l < 100:
            test_rgb = hsl_to_rgb((h, s, test_l))
            if wcag_contrast_ratio(test_rgb, base_rgb) >= target_ratio:
                return test_rgb
            test_l += 2
        return (255, 255, 255)  # Fallback to white
    else:
        # Need darker text on light background
        test_l = l
        while test_l > 0:
            test_rgb = hsl_to_rgb((h, s, test_l))
            if wcag_contrast_ratio(test_rgb, base_rgb) >= target_ratio:
                return test_rgb
            test_l -= 2
        return (0, 0, 0)  # Fallback to black


def hsl_to_rgb(hsl: tuple[float, float, float]) -> tuple[int, int, int]:
    """Convert HSL to RGB."""
    h, s, l = hsl
    h = h / 360.0
    s = s / 100.0
    l = l / 100.0
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return (int(r * 255), int(g * 255), int(b * 255))


def lighten_color(rgb: tuple[int, int, int], percent: float) -> tuple[int, int, int]:
    """Lighten a color by a percentage."""
    h, s, l = rgb_to_hsl(rgb)
    l = min(100, l + percent)
    return hsl_to_rgb((h, s, l))


def darken_color(rgb: tuple[int, int, int], percent: float) -> tuple[int, int, int]:
    """Darken a color by a percentage."""
    h, s, l = rgb_to_hsl(rgb)
    l = max(0, l - percent)
    return hsl_to_rgb((h, s, l))


def saturate_color(rgb: tuple[int, int, int], percent: float) -> tuple[int, int, int]:
    """Adjust saturation of a color."""
    h, s, l = rgb_to_hsl(rgb)
    s = max(0, min(100, s + percent))
    return hsl_to_rgb((h, s, l))


def desaturate_color(rgb: tuple[int, int, int], percent: float) -> tuple[int, int, int]:
    """Desaturate a color."""
    return saturate_color(rgb, -percent)


def categorize_by_hue(rgb: tuple[int, int, int]) -> str:
    """Categorize a color by its hue."""
    h, s, l = rgb_to_hsl(rgb)
    
    if s < 15:  # Low saturation = neutral
        return "neutral"
    
    if h < 15 or h >= 345:
        return "red"
    elif h < 45:
        return "orange"
    elif h < 75:
        return "yellow"
    elif h < 150:
        return "green"
    elif h < 195:
        return "cyan"
    elif h < 255:
        return "blue"
    elif h < 285:
        return "purple"
    else:
        return "pink"


def find_color_by_category(colors: list[tuple[int, int, int]], category: str) -> tuple[int, int, int] | None:
    """Find the best color matching a category."""
    for rgb in colors:
        if categorize_by_hue(rgb) == category:
            return rgb
    return None


def generate_text_color_for_bg(bg_rgb: tuple[int, int, int]) -> str:
    """Generate appropriate text color (black or white) for a background."""
    contrast_white = wcag_contrast_ratio(bg_rgb, (255, 255, 255))
    contrast_black = wcag_contrast_ratio(bg_rgb, (0, 0, 0))
    return "#ffffff" if contrast_white > contrast_black else "#000000"


def extract_colors(image_path: str, apply_blur: bool, color_count: int = 6) -> list[tuple[int, int, int]]:
    """Extract dominant colors from an image."""
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")
    
    if apply_blur:
        # Create a blurred copy
        img = Image.open(image_path)
        img = img.filter(ImageFilter.GaussianBlur(radius=8))
        temp_path = f"/tmp/blurred_{path.name}"
        img.save(temp_path)
        image_path = temp_path
    
    color_thief = ColorThief(image_path)
    palette = color_thief.get_palette(color_count=color_count, quality=10)
    
    if apply_blur:
        Path(temp_path).unlink(missing_ok=True)
    
    return palette


def calculate_button_transparency(colors: list[tuple[int, int, int]]) -> float:
    """Calculate button transparency based on average luminance."""
    avg_luminance = sum(get_luminance(c) for c in colors) / len(colors)
    return round(0.85 + (avg_luminance * 0.1), 2)


def build_theme_colors(colors: list[tuple[int, int, int]], is_dark: bool) -> dict:
    """Build theme colors from extracted palette."""
    # Sort by saturation to find most vibrant colors
    sorted_by_sat = sorted(colors, key=lambda c: rgb_to_hsl(c)[1], reverse=True)
    
    # Primary = most saturated vibrant color
    primary = sorted_by_sat[0] if sorted_by_sat else colors[0]
    
    # Secondary = less saturated color
    secondary = sorted_by_sat[-1] if len(sorted_by_sat) > 1 else colors[1]
    
    # Find semantic colors by hue
    success = find_color_by_category(colors, "green")
    if not success:
        # Generate green by rotating hue
        h, s, l = rgb_to_hsl(primary)
        success = hsl_to_rgb((120, s, l))
    
    warning = find_color_by_category(colors, "yellow") or find_color_by_category(colors, "orange")
    if not warning:
        h, s, l = rgb_to_hsl(primary)
        warning = hsl_to_rgb((45, s, l))
    
    danger = find_color_by_category(colors, "red")
    if not danger:
        h, s, l = rgb_to_hsl(primary)
        danger = hsl_to_rgb((0, s, l))
    
    info = find_color_by_category(colors, "cyan") or find_color_by_category(colors, "blue")
    if not info:
        h, s, l = rgb_to_hsl(primary)
        info = hsl_to_rgb((195, s, l))
    
    # Light and dark from luminance
    sorted_by_lum = sorted(colors, key=get_luminance)
    light = sorted_by_lum[-1] if sorted_by_lum else (248, 249, 250)
    dark = sorted_by_lum[0] if sorted_by_lum else (33, 37, 41)
    
    # Body colors
    body_bg = light if not is_dark else dark
    body_color = find_contrast_color(body_bg, 7.0, is_dark)
    
    return {
        "primary": primary,
        "secondary": secondary,
        "success": success,
        "warning": warning,
        "danger": danger,
        "info": info,
        "light": light,
        "dark": dark,
        "body_bg": body_bg,
        "body_color": body_color,
        "button_transparency": calculate_button_transparency(colors),
    }


def generate_css(colors: dict, is_dark: bool) -> str:
    """Generate CSS variables for a theme."""
    selector = '[data-bs-theme="dark"]' if is_dark else ':root'
    lines = []
    
    lines.append(f"/* {('Dark' if is_dark else 'Light')} Mode Colors */")
    lines.append(f"{selector} {{")
    
    # Theme colors
    lines.append("    /* === THEME COLORS === */")
    for name in ["primary", "secondary", "success", "info", "warning", "danger", "light", "dark"]:
        rgb = colors[name]
        lines.append(f"    --bs-{name}: {rgb_to_hex(rgb)};")
        lines.append(f"    --bs-{name}-rgb: {rgb[0]}, {rgb[1]}, {rgb[2]};")
    
    lines.append("    --bs-white: #ffffff;")
    lines.append("    --bs-white-rgb: 255, 255, 255;")
    lines.append("    --bs-black: #000000;")
    lines.append("    --bs-black-rgb: 0, 0, 0;")
    
    # Text emphasis
    lines.append("")
    lines.append("    /* === TEXT EMPHASIS === */")
    for name in ["primary", "secondary", "success", "info", "warning", "danger"]:
        rgb = colors[name]
        emphasis = find_contrast_color(rgb, 7.0, is_dark)
        lines.append(f"    --bs-{name}-text-emphasis: {rgb_to_hex(emphasis)};")
    
    lines.append(f"    --bs-light-text-emphasis: {'#f8f9fa' if is_dark else '#495057'};")
    lines.append(f"    --bs-dark-text-emphasis: {'#dee2e6' if is_dark else '#495057'};")
    
    # Background subtle
    lines.append("")
    lines.append("    /* === BACKGROUND SUBTLE === */")
    for name in ["primary", "secondary", "success", "info", "warning", "danger", "light", "dark"]:
        rgb = colors[name]
        subtle = lighten_color(rgb, 70) if not is_dark else darken_color(rgb, 70)
        lines.append(f"    --bs-{name}-bg-subtle: {rgb_to_hex(subtle)};")
    
    # Border subtle
    lines.append("")
    lines.append("    /* === BORDER SUBTLE === */")
    for name in ["primary", "secondary", "success", "info", "warning", "danger", "light", "dark"]:
        rgb = colors[name]
        subtle = lighten_color(rgb, 50) if not is_dark else darken_color(rgb, 50)
        lines.append(f"    --bs-{name}-border-subtle: {rgb_to_hex(subtle)};")
    
    # Body
    lines.append("")
    lines.append("    /* === BODY === */")
    body_bg = colors["body_bg"]
    body_color = colors["body_color"]
    lines.append(f"    --bs-body-bg: {rgb_to_hex(body_bg)};")
    lines.append(f"    --bs-body-bg-rgb: {body_bg[0]}, {body_bg[1]}, {body_bg[2]};")
    lines.append(f"    --bs-body-color: {rgb_to_hex(body_color)};")
    lines.append(f"    --bs-body-color-rgb: {body_color[0]}, {body_color[1]}, {body_color[2]};")
    
    # Emphasis
    lines.append("")
    lines.append("    /* === EMPHASIS === */")
    emphasis = (255, 255, 255) if is_dark else (0, 0, 0)
    lines.append(f"    --bs-emphasis-color: {rgb_to_hex(emphasis)};")
    lines.append(f"    --bs-emphasis-color-rgb: {emphasis[0]}, {emphasis[1]}, {emphasis[2]};")
    
    # Secondary colors
    lines.append("")
    lines.append("    /* === SECONDARY === */")
    if is_dark:
        lines.append("    --bs-secondary-color: rgba(222, 226, 230, 0.75);")
        lines.append("    --bs-secondary-color-rgb: 222, 226, 230;")
        lines.append("    --bs-secondary-bg: #343a40;")
        lines.append("    --bs-secondary-bg-rgb: 52, 58, 64;")
    else:
        lines.append("    --bs-secondary-color: rgba(33, 37, 41, 0.75);")
        lines.append("    --bs-secondary-color-rgb: 33, 37, 41;")
        lines.append("    --bs-secondary-bg: #e9ecef;")
        lines.append("    --bs-secondary-bg-rgb: 233, 236, 239;")
    
    # Tertiary colors
    lines.append("")
    lines.append("    /* === TERTIARY === */")
    if is_dark:
        lines.append("    --bs-tertiary-color: rgba(222, 226, 230, 0.5);")
        lines.append("    --bs-tertiary-color-rgb: 222, 226, 230;")
        lines.append("    --bs-tertiary-bg: #2b3035;")
        lines.append("    --bs-tertiary-bg-rgb: 43, 48, 53;")
    else:
        lines.append("    --bs-tertiary-color: rgba(33, 37, 41, 0.5);")
        lines.append("    --bs-tertiary-color-rgb: 33, 37, 41;")
        lines.append("    --bs-tertiary-bg: #f8f9fa;")
        lines.append("    --bs-tertiary-bg-rgb: 248, 249, 250;")
    
    # Links
    lines.append("")
    lines.append("    /* === LINKS === */")
    primary = colors["primary"]
    hover = lighten_color(primary, 10) if is_dark else darken_color(primary, 10)
    lines.append(f"    --bs-link-color: {rgb_to_hex(primary)};")
    lines.append(f"    --bs-link-color-rgb: {primary[0]}, {primary[1]}, {primary[2]};")
    lines.append(f"    --bs-link-hover-color: {rgb_to_hex(hover)};")
    lines.append(f"    --bs-link-hover-color-rgb: {hover[0]}, {hover[1]}, {hover[2]};")
    
    # Borders
    lines.append("")
    lines.append("    /* === BORDERS === */")
    border_color = (73, 80, 87) if is_dark else (222, 226, 230)
    lines.append(f"    --bs-border-color: {rgb_to_hex(border_color)};")
    lines.append(f"    --bs-border-color-translucent: {'rgba(255, 255, 255, 0.15)' if is_dark else 'rgba(0, 0, 0, 0.175)'};")
    
    # Buttons
    lines.append("")
    lines.append("    /* === BUTTONS === */")
    
    button_types = ["primary", "secondary", "success", "info", "warning", "danger", "light", "dark"]
    
    for btn_type in button_types:
        base = colors[btn_type]
        text = (255, 255, 255) if get_luminance(base) < 0.5 else (0, 0, 0)
        hover = lighten_color(base, 10) if is_dark else darken_color(base, 10)
        active = lighten_color(base, 15) if is_dark else darken_color(base, 15)
        border = darken_color(base, 10)
        border_hover = darken_color(hover, 5)
        border_active = darken_color(active, 5)
        focus = lighten_color(base, 30)
        
        lines.append("")
        lines.append(f"    /* {btn_type.capitalize()} Button */")
        lines.append(f"    --bs-btn-{btn_type}-color: {rgb_to_hex(text)};")
        lines.append(f"    --bs-btn-{btn_type}-bg: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-{btn_type}-border-color: {rgb_to_hex(border)};")
        lines.append(f"    --bs-btn-{btn_type}-hover-color: {rgb_to_hex(text)};")
        lines.append(f"    --bs-btn-{btn_type}-hover-bg: {rgb_to_hex(hover)};")
        lines.append(f"    --bs-btn-{btn_type}-hover-border-color: {rgb_to_hex(border_hover)};")
        lines.append(f"    --bs-btn-{btn_type}-active-color: {rgb_to_hex(text)};")
        lines.append(f"    --bs-btn-{btn_type}-active-bg: {rgb_to_hex(active)};")
        lines.append(f"    --bs-btn-{btn_type}-active-border-color: {rgb_to_hex(border_active)};")
        lines.append(f"    --bs-btn-{btn_type}-disabled-color: {rgb_to_hex(text)};")
        lines.append(f"    --bs-btn-{btn_type}-disabled-bg: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-{btn_type}-disabled-border-color: {rgb_to_hex(border)};")
        lines.append(f"    --bs-btn-{btn_type}-focus-shadow-rgb: {focus[0]}, {focus[1]}, {focus[2]};")
        
        # Outline button
        lines.append(f"    --bs-btn-outline-{btn_type}-color: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-border-color: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-hover-color: {rgb_to_hex(text)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-hover-bg: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-hover-border-color: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-active-color: {rgb_to_hex(text)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-active-bg: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-active-border-color: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-disabled-color: {rgb_to_hex(base)};")
        lines.append(f"    --bs-btn-outline-{btn_type}-disabled-bg: transparent;")
        lines.append(f"    --bs-btn-outline-{btn_type}-disabled-border-color: {rgb_to_hex(base)};")
    
    # Form validation
    lines.append("")
    lines.append("    /* === FORM VALIDATION === */")
    success = colors["success"]
    danger = colors["danger"]
    lines.append(f"    --bs-form-valid-color: {rgb_to_hex(success)};")
    lines.append(f"    --bs-form-valid-border-color: {rgb_to_hex(success)};")
    lines.append(f"    --bs-form-invalid-color: {rgb_to_hex(danger)};")
    lines.append(f"    --bs-form-invalid-border-color: {rgb_to_hex(danger)};")
    
    # Code and highlight
    lines.append("")
    lines.append("    /* === CODE & HIGHLIGHT === */")
    lines.append(f"    --bs-code-color: {rgb_to_hex(colors['danger'])};")
    lines.append(f"    --bs-highlight-color: {rgb_to_hex(body_color)};")
    lines.append(f"    --bs-highlight-bg: {rgb_to_hex(colors['warning'])};")
    
    lines.append("}")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Color Theme Generator for Bootstrap 5",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
The tool processes two images:
  - Light mode: <image>.png
  - Dark mode:  <image>-dark.png

Example:
  python3 tools/color-theme.py --image=static/img/bg-lego
        """
    )
    parser.add_argument(
        "--image",
        default="static/img/bg-lego",
        help="Base path for images (default: static/img/bg-lego)"
    )
    parser.add_argument(
        "--blur",
        action="store_true",
        default=True,
        help="Apply blur before extraction (default: True)"
    )
    parser.add_argument(
        "--no-blur",
        action="store_false",
        dest="blur",
        help="Skip blur, analyze raw image"
    )
    parser.add_argument(
        "--output",
        help="Output file (default: stdout)"
    )
    parser.add_argument(
        "--clusters",
        type=int,
        default=6,
        help="Number of color clusters to extract (default: 6)"
    )
    
    args = parser.parse_args()
    
    light_image = f"{args.image}.png"
    dark_image = f"{args.image}-dark.png"
    
    try:
        # Extract colors
        print(f"Analyzing: {light_image}", file=sys.stderr)
        light_colors = extract_colors(light_image, args.blur, args.clusters)
        
        print(f"Analyzing: {dark_image}", file=sys.stderr)
        dark_colors = extract_colors(dark_image, args.blur, args.clusters)
        
        # Build theme
        light_theme = build_theme_colors(light_colors, is_dark=False)
        dark_theme = build_theme_colors(dark_colors, is_dark=True)
        
        # Generate CSS
        output_lines = []
        output_lines.append("/* ============================================================")
        output_lines.append("   GENERATED COLOR VARIABLES - Bootstrap 5 Theme")
        output_lines.append(f"   Generated: {__import__('datetime').datetime.now().isoformat()}")
        output_lines.append(f"   Light image: {light_image}")
        output_lines.append(f"   Dark image: {dark_image}")
        output_lines.append(f"   Blur applied: {args.blur}")
        output_lines.append("   ============================================================ */")
        output_lines.append("")
        output_lines.append("/* BEGIN GENERATED COLORS */")
        output_lines.append("")
        output_lines.append(generate_css(light_theme, is_dark=False))
        output_lines.append("")
        output_lines.append(generate_css(dark_theme, is_dark=True))
        output_lines.append("")
        output_lines.append("/* END GENERATED COLORS */")
        
        css = "\n".join(output_lines)
        
        if args.output:
            Path(args.output).write_text(css)
            print(f"Written to: {args.output}", file=sys.stderr)
        else:
            print(css)
            
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
