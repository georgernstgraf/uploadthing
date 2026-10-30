#!/bin/sh
#
# Verschlüsseltes Backup der OPNsense-Konfiguration (#148).
#
# Zieht /conf/config.xml per ssh von der Sense, verschlüsselt es mit dem
# GPG-Public-Key des Repo-Eigentümers und legt das Chiffrat unter
# appliance/backups/config-YYYY-MM-DD.xml.gpg ab. Klartext berührt die
# Festplatte nur im temporären Arbeitsverzeichnis (umask 077, wird beim
# Verlassen gelöscht) und landet nie im Repo.
#
# Aufruf (vom Repo-Root oder beliebig):
#     scripts/backup-config.sh            # neues Tagesbackup
#     scripts/backup-config.sh --force    # vorhandenes Tagesbackup ersetzen
#
# Voraussetzungen: ssh-Zugang zur Sense ("ssh sense"), dort passwortloses
# sudo für /conf/config.xml und opnsense-version, gpg mit dem Public-Key
# im lokalen Keyring. Verschlüsseln braucht keine Passphrase — nur das
# Entschlüsseln (Restore, siehe docs/ai/OPERATIONS.md).

set -eu

umask 077

# Empfänger: Georg Graf <georg@graf.priv.at>. Der Secret-Key liegt NICHT im
# Repo, sondern ausschließlich im lokalen Keyring (key id EC23CFDFDDA530BD).
RECIPIENT="19BAB05BF4D9B55D49071A9DEC23CFDFDDA530BD"
REMOTE="${OPNSENSE_REMOTE:-sense}"
CONFIG_PATH="/conf/config.xml"

fail() {
    echo "Fehler: $*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Aufruf: scripts/backup-config.sh [--force]

  --force, -f   ein bereits vorhandenes Chiffrat für das heutige Datum
                überschreiben (Manifest-Eintrag wird ersetzt, nicht doppelt)
  --help, -h    diese Hilfe ausgeben

Umgebung: OPNSENSE_REMOTE (Default: sense) — ssh-Ziel der Firewall.
EOF
}

force=0
for arg in "$@"; do
    case "$arg" in
        -f | --force) force=1 ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            usage >&2
            fail "unbekanntes Argument: $arg"
            ;;
    esac
done

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d' ' -f1
    elif command -v openssl >/dev/null 2>&1; then
        openssl dgst -sha256 "$1" | sed 's/.*= *//'
    else
        fail "kein sha256-Werkzeug gefunden (sha256sum, shasum oder openssl)."
    fi
}

command -v gpg >/dev/null 2>&1 || fail "gpg ist nicht installiert."
command -v ssh >/dev/null 2>&1 || fail "ssh ist nicht installiert."
command -v awk >/dev/null 2>&1 || fail "awk ist nicht installiert."

key_id=$(gpg --batch --with-colons --list-keys "$RECIPIENT" 2>/dev/null |
    awk -F: '$1 == "pub" { print $5; exit }') || true
[ -n "${key_id}" ] ||
    fail "GPG-Schlüssel $RECIPIENT ist im lokalen Keyring nicht vorhanden (Import aus ~/pass o. ä. nötig)."

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(dirname -- "$script_dir")
backup_dir="${repo_root}/appliance/backups"
manifest="${backup_dir}/MANIFEST"

today=$(date +%Y-%m-%d)
target_rel="appliance/backups/config-${today}.xml.gpg"
target="${repo_root}/${target_rel}"

mkdir -p "${backup_dir}"
# Fail fast, bevor die Sense überhaupt angesprochen wird.
if [ -e "${target}" ] && [ "${force}" -ne 1 ]; then
    fail "${target_rel} existiert bereits — mit --force überschreiben (oder das vorhandene Backup behalten)."
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/opnsense-backup.XXXXXX") ||
    fail "temporäres Arbeitsverzeichnis konnte nicht angelegt werden."
cleanup() {
    rm -rf "${work}"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

echo "Lese ${CONFIG_PATH} von '${REMOTE}' ..."
if ! ssh -o BatchMode=yes "$REMOTE" "sudo -n cat ${CONFIG_PATH}" >"${work}/config.xml"; then
    fail "Konfiguration konnte nicht von '${REMOTE}' gelesen werden (ssh-Zugang und passwordloses sudo prüfen)."
fi
[ -s "${work}/config.xml" ] || fail "die gelesene Konfiguration ist leer — Backup abgebrochen."
grep -q '<opnsense' "${work}/config.xml" ||
    fail "die gelesene Datei ist keine OPNsense-Konfiguration (kein <opnsense>-Element)."

# "OPNsense 26.7.3_11 (amd64)" -> "26.7.3_11" (Manifest bleibt einwertig).
version=$(ssh -o BatchMode=yes "$REMOTE" "sudo -n opnsense-version" | head -n 1 | awk '{ print $2 }')
[ -n "${version}" ] || fail "OPNsense-Version konnte nicht ermittelt werden."

echo "Verschlüssele nach ${target_rel} (Empfänger ${key_id}) ..."
if ! gpg --batch --yes --no-tty --quiet --encrypt --recipient "$RECIPIENT" \
    --output "${work}/config.xml.gpg" "${work}/config.xml"; then
    fail "Verschlüsselung fehlgeschlagen (Empfänger ${RECIPIENT})."
fi

sha=$(sha256_file "${work}/config.xml.gpg")

cp "${work}/config.xml.gpg" "${target}.part" ||
    fail "${target_rel} konnte nicht geschrieben werden."
mv -f "${target}.part" "${target}" ||
    fail "${target_rel} konnte nicht an den Zielort verschoben werden."

installed=$(sha256_file "${target}")
if [ "${installed}" != "${sha}" ]; then
    rm -f "${target}"
    fail "sha256 des abgelegten Chiffrats weicht ab (${installed} != ${sha}) — Datei entfernt."
fi

tmp_manifest="${work}/MANIFEST"
if [ -f "${manifest}" ]; then
    # Eintrag für dieselbe Datei ersetzen, Reihenfolge der übrigen erhalten.
    awk -F'\t' -v file="${target_rel}" '
        /^#/ { print; next }
        NF == 0 { next }
        $5 == file { next }
        { print }
    ' "${manifest}" >"${tmp_manifest}"
else
    {
        echo "# MANIFEST — verschlüsselte OPNsense-Konfigurationsbackups, Ticket #148."
        echo "# Spalten (TAB-getrennt): datum, opnsense-version, sha256-des-chiffrats, empfänger-key-id, datei"
        echo "# Der private GPG-Schlüssel und jeder Klartext (config.xml) liegen nie im Repo."
    } >"${tmp_manifest}"
fi
printf '%s\t%s\t%s\t%s\t%s\n' \
    "${today}" "${version}" "${sha}" "${key_id}" "${target_rel}" >>"${tmp_manifest}"
cp "${tmp_manifest}" "${manifest}" ||
    fail "${manifest} konnte nicht geschrieben werden."

size=$(wc -c <"${target}" | tr -d ' ')
echo "OK: ${target_rel} (${size} Bytes, sha256 ${sha}, OPNsense ${version})"
echo "Manifest: appliance/backups/MANIFEST"
echo "Prüfen:   gpg --list-packets --verbose ${target_rel}"
echo "          gpg --list-only --decrypt --status-fd 1 ${target_rel}"
