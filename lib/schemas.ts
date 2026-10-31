import { z } from "zod";
import { zfd } from "zod-form-data";
import { normalizeMac } from "./mac.ts";

const macField = zfd.text(
    z.string({ required_error: "Bitte eine MAC-Adresse angeben." })
        .trim()
        .min(1, "Bitte eine MAC-Adresse angeben.")
        .refine(
            (value) => normalizeMac(value) !== null,
            "Ungültige MAC-Adresse (erwartet z. B. aa:bb:cc:dd:ee:ff).",
        ),
);

/** Freigabe einer MAC-Adresse samt Kommentar (#147). */
export const AdminMacSchema = zfd.formData({
    mac: macField,
    comment: zfd.text(
        z.string({
            // zfd.text liefert für ein leeres Feld `undefined`; ohne
            // deutsche required-Meldung stünde „Required" in der UI.
            required_error:
                "Bitte einen Kommentar angeben (z. B. welches Gerät).",
        })
            .trim()
            .min(1, "Bitte einen Kommentar angeben (z. B. welches Gerät).")
            .max(120, "Der Kommentar darf höchstens 120 Zeichen lang sein."),
    ),
});

/** Entfernen einer Freigabe; die MAC wird zusätzlich im Service validiert. */
export const AdminMacDeleteSchema = zfd.formData({
    mac: macField,
});

export const LdapSearchSchema = z.object({
    q: z
        .string({
            required_error: "Bitte einen Namen eingeben.",
        })
        .trim()
        .min(3, "Bitte mindestens 3 Zeichen eingeben."),
});

export const RegisterSchema = z.object({
    email: z.string().email("Ungültige E-Mail-Adresse"),
});

/**
 * Schalter „Neuanmeldung im Examen erlauben" (#161). Gleiche Form wie
 * `AdminExamModeSchema`: eine Checkbox, die im Formular als `on` ankommt
 * oder ganz fehlt.
 */
export const AdminExamRegistrationSchema = zfd.formData({
    registration_open: zfd.text(z.enum(["on"]).optional()),
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

/**
 * Upload einer Unterlage (#134). `replace_existing` ist die ausdrückliche
 * Bestätigung, dass eine gleichnamige Datei überschrieben werden darf —
 * ohne sie lehnt der Service das Ersetzen ab.
 */
export const AdminUnterlagenUploadSchema = zfd.formData({
    // Ohne eigene Meldung stünde „Input not instance of File“ in der UI.
    file: zfd.file(
        z.instanceof(File, { message: "Bitte eine Datei auswählen." }),
    ),
    replace_existing: zfd.text(z.string().optional()),
});

export const AdminUnterlagenDeleteSchema = zfd.formData({
    filename: zfd.text(
        z.string({
            required_error: "Bitte eine Unterlage auswählen.",
        })
            .trim()
            .min(1, "Bitte eine Unterlage auswählen."),
    ),
});

/** „Alles löschen“ braucht wie die Datenbankbereinigung ein Bestätigungsfeld. */
export const AdminUnterlagenDeleteAllSchema = zfd.formData({
    confirm_delete_all: zfd.text(
        z.literal("unterlagen-loeschen", {
            errorMap: () => ({
                message: "Ungültige Anfrage für das Löschen der Unterlagen.",
            }),
        }),
    ),
});
