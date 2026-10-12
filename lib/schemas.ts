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

/**
 * Prüfungsdauer in Minuten (Ganzzahl, 1–600 Minuten = max. 10 Stunden).
 * Die Dauer wird in der API stets in Minuten angegeben und vom
 * Service in Sekunden gerechnet.
 */
export const AdminExamStartSchema = zfd.formData({
    minutes: zfd.text(
        z.string().min(1, "Bitte eine Prüfungsdauer in Minuten angeben."),
    ).pipe(
        z.coerce.number({
            invalid_type_error: "Die Prüfungsdauer muss eine Zahl in Minuten sein.",
        }).int("Die Prüfungsdauer muss eine ganze Zahl in Minuten sein.")
            .gt(0, "Die Prüfungsdauer muss größer als 0 Minuten sein.")
            .max(600, "Die Prüfungsdauer darf höchstens 600 Minuten betragen."),
    ),
});

/**
 * Zusatzzeit in Minuten (Ganzzahl, 1–600 Minuten), die auf ein
 * laufendes oder pausiertes Examen angerechnet wird.
 */
export const AdminExamExtraSchema = zfd.formData({
    minutes: zfd.text(
        z.string().min(1, "Bitte eine Zusatzzeit in Minuten angeben."),
    ).pipe(
        z.coerce.number({
            invalid_type_error: "Die Zusatzzeit muss eine Zahl in Minuten sein.",
        }).int("Die Zusatzzeit muss eine ganze Zahl in Minuten sein.")
            .gt(0, "Die Zusatzzeit muss größer als 0 Minuten sein.")
            .max(600, "Die Zusatzzeit darf höchstens 600 Minuten betragen."),
    ),
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
