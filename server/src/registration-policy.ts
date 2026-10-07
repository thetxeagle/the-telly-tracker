export function shouldGrantAdministrator(firstAccount: boolean, bootstrapAdministrator: boolean) {
  return firstAccount || bootstrapAdministrator
}
