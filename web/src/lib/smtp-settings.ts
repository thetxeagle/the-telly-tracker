export function smtpSettingsFromForm(form: FormData, enabled: boolean, prefix: string) {
  return {
    enabled,
    host: String(form.get(`${prefix}Host`) ?? ""),
    port: Number(form.get(`${prefix}Port`) ?? 587),
    secure: form.get(`${prefix}Secure`) === "on",
    username: String(form.get(`${prefix}Username`) ?? ""),
    password: String(form.get(`${prefix}Password`) ?? ""),
    fromName: String(form.get(`${prefix}FromName`) ?? "Telly Tracker"),
    fromEmail: String(form.get(`${prefix}FromEmail`) ?? ""),
  }
}
