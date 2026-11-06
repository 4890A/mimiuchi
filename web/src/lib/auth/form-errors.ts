import type { FormError } from "./actions";
import type { TFunction } from "@/lib/i18n/translate";

/** The message for a setup / change-password error, in the reader's language. */
export function formErrorMessage(t: TFunction, error: FormError): string {
  switch (error.code) {
    case "passwordTooShort":
      return t("auth.error.passwordTooShort", { min: error.min });
    case "passwordMismatch":
      return t("auth.error.passwordMismatch");
    case "noFolders":
      return t("auth.error.noFolders");
    case "folderMissing":
      return t("auth.error.folderMissing", { paths: error.paths.join(", ") });
    case "alreadySetUp":
      return t("auth.error.alreadySetUp");
    case "wrongPassword":
      return t("auth.error.wrongPassword");
    case "managedByEnv":
      return t("auth.error.managedByEnv");
  }
}
