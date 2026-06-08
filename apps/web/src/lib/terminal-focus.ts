interface PassiveTerminalFocusRepairOptions {
  documentHasFocus: boolean;
  helperAvailable: boolean;
  helperFocused: boolean;
  intentionalExternalFocus: boolean;
  lastExternalUserIntentAt: number;
  lastTerminalIntentAt: number;
}

interface IntentionalExternalFocusOptions {
  activeElementIsDocumentBody: boolean;
  activeElementProtected: boolean;
  externalFocusGraceMs: number;
  lastExternalUserIntentAt: number;
  lastTerminalIntentAt: number;
  now: number;
}

interface ExternalFocusPromotionOptions {
  externalFocusGraceMs: number;
  hasFreshUserActivation: boolean;
  lastExternalPointerIntentAt: number;
  lastExternalUserIntentAt: number;
  lastTerminalIntentAt: number;
  now: number;
  targetIsFrame: boolean;
  targetIsHovered: boolean;
}

interface TerminalPanePointerActivationOptions {
  button: number;
  pointerType: string;
}

export function shouldActivateTerminalPaneFromPointer(
  options: TerminalPanePointerActivationOptions,
): boolean {
  return options.pointerType !== "mouse" || options.button === 0;
}

export function hasIntentionalExternalFocus(
  options: IntentionalExternalFocusOptions,
): boolean {
  return (
    options.lastExternalUserIntentAt > 0 &&
    options.lastExternalUserIntentAt >= options.lastTerminalIntentAt
  );
}

export function shouldPromoteExternalFocusToUserIntent(
  options: ExternalFocusPromotionOptions,
): boolean {
  if (options.lastTerminalIntentAt === 0) {
    return true;
  }

  if (
    options.lastExternalUserIntentAt > 0 &&
    options.lastExternalUserIntentAt >= options.lastTerminalIntentAt
  ) {
    return true;
  }

  if (options.hasFreshUserActivation && options.targetIsHovered) {
    return true;
  }

  if (options.targetIsFrame && options.targetIsHovered) {
    return true;
  }

  return (
    options.lastExternalPointerIntentAt > 0 &&
    options.lastExternalPointerIntentAt > options.lastTerminalIntentAt &&
    options.now - options.lastExternalPointerIntentAt <
      options.externalFocusGraceMs
  );
}

export function shouldRepairPassiveTerminalFocus(
  options: PassiveTerminalFocusRepairOptions,
): boolean {
  if (!options.documentHasFocus) {
    return false;
  }

  if (!options.helperAvailable || options.helperFocused) {
    return false;
  }

  if (options.intentionalExternalFocus) {
    return false;
  }

  if (options.lastExternalUserIntentAt === 0) {
    return true;
  }

  return options.lastTerminalIntentAt > options.lastExternalUserIntentAt;
}
