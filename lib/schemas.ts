import { z } from "zod";
import { zfd } from "zod-form-data";

export const LdapSearchSchema = z.object({
    email: z.string().min(3, "Suchbegriff muss mindestens 3 Zeichen lang sein"),
});

export const RegisterSchema = z.object({
    email: z.string().email("Ungültige E-Mail-Adresse"),
});

export const ActiveIpsSchema = z.object({
    ips: z.array(z.string().ip()).min(1, "Mindestens eine IP-Adresse erforderlich"),
});

export const AdminQuerySchema = z.object({
    startdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat (YYYY-MM-DD)").optional(),
    starttime: z.string().regex(/^\d{2}:\d{2}$/, "Ungültiges Zeitformat (HH:MM)").optional(),
    enddate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat (YYYY-MM-DD)").optional(),
    endtime: z.string().regex(/^\d{2}:\d{2}$/, "Ungültiges Zeitformat (HH:MM)").optional(),
});

export const AdminFileTypesSchema = zfd.formData({
    permitted_filetypes: zfd.text(
        z.string().min(1, "Mindestens ein Dateityp ist erforderlich"),
    ),
});

export const AdminExamModeSchema = zfd.formData({
    internet_active: zfd.text(z.enum(["on"]).optional()),
});

export const AdminThemeSchema = zfd.formData({
    theme: zfd.text(
        z.string().min(1, "Bitte ein Theme auswählen"),
    ),
});

export const AdminCleanupDatabaseSchema = zfd.formData({
    confirm_cleanup: zfd.text(z.literal("cleanup-db")),
});

export const UploadSchema = zfd.formData({
    file: zfd.file(),
});
