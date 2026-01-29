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

export const ForensicQuerySchema = z.object({
    startdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat (YYYY-MM-DD)").optional(),
    starttime: z.string().regex(/^\d{2}:\d{2}$/, "Ungültiges Zeitformat (HH:MM)").optional(),
    enddate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat (YYYY-MM-DD)").optional(),
    endtime: z.string().regex(/^\d{2}:\d{2}$/, "Ungültiges Zeitformat (HH:MM)").optional(),
});

export const UploadSchema = zfd.formData({
    file: zfd.file(),
});
