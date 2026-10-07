import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { SmtpSettings } from "@/lib/types"

type SmtpSettingsFieldsProps = {
  defaults?: SmtpSettings
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  idPrefix: string
}

export function SmtpSettingsFields({ defaults, enabled, onEnabledChange, idPrefix }: SmtpSettingsFieldsProps) {
  const name = (field: string) => `${idPrefix}${field}`

  return (
    <FieldGroup className="smtp-fields">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={name("Enabled")}>Enable SMTP delivery</FieldLabel>
          <FieldDescription>Send invitation links directly from Telly Tracker.</FieldDescription>
        </FieldContent>
        <Switch id={name("Enabled")} checked={enabled} onCheckedChange={onEnabledChange} />
      </Field>
      <div className="smtp-field-grid">
        <Field><FieldLabel htmlFor={name("Host")}>SMTP host</FieldLabel><Input id={name("Host")} name={name("Host")} defaultValue={defaults?.host} placeholder="smtp.example.com" disabled={!enabled} required={enabled} /></Field>
        <Field><FieldLabel htmlFor={name("Port")}>Port</FieldLabel><Input id={name("Port")} name={name("Port")} type="number" min="1" max="65535" defaultValue={defaults?.port ?? 587} disabled={!enabled} required={enabled} /></Field>
      </div>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={name("Secure")}>Implicit TLS</FieldLabel>
          <FieldDescription>Enable for port 465. STARTTLS on port 587 does not need this.</FieldDescription>
        </FieldContent>
        <Switch id={name("Secure")} name={name("Secure")} defaultChecked={defaults?.secure} disabled={!enabled} />
      </Field>
      <div className="smtp-field-grid">
        <Field><FieldLabel htmlFor={name("Username")}>Username</FieldLabel><Input id={name("Username")} name={name("Username")} defaultValue={defaults?.username} autoComplete="off" disabled={!enabled} /></Field>
        <Field>
          <FieldLabel htmlFor={name("Password")}>Password</FieldLabel>
          <Input id={name("Password")} name={name("Password")} type="password" autoComplete="new-password" disabled={!enabled} placeholder={defaults?.hasPassword ? "Saved — leave blank to keep" : "Optional"} />
        </Field>
      </div>
      <div className="smtp-field-grid">
        <Field><FieldLabel htmlFor={name("FromName")}>Sender name</FieldLabel><Input id={name("FromName")} name={name("FromName")} defaultValue={defaults?.fromName ?? "Telly Tracker"} disabled={!enabled} required={enabled} /></Field>
        <Field><FieldLabel htmlFor={name("FromEmail")}>Sender email</FieldLabel><Input id={name("FromEmail")} name={name("FromEmail")} type="email" defaultValue={defaults?.fromEmail} placeholder="telly@example.com" disabled={!enabled} required={enabled} /></Field>
      </div>
    </FieldGroup>
  )
}
