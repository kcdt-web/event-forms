import { Injectable } from '@angular/core';
import { AbstractControl, Validators, ValidationErrors } from '@angular/forms';

import { CountryCode, isValidPhoneNumber, getExampleNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';

@Injectable({
  providedIn: 'root',
})
export class ValidateMobileNumber {
  /** Returns the max national number length for a country */
  getPhoneMaxLength(countryIso2?: string): number {
    if (!countryIso2) return 15;
    try {
      const example = getExampleNumber(countryIso2 as CountryCode, examples);
      return example?.nationalNumber?.length || 15;
    } catch {
      return 15;
    }
  }

  /** Custom validator allowing empty but validating if present */
  optionalPhoneValidator(countryIso2?: string) {
    return (control: AbstractControl): ValidationErrors | null => {
      const v = control.value;
      if (!v) return null;

      const valid = isValidPhoneNumber(String(v), countryIso2 as CountryCode);
      return valid ? null : { invalidPhone: true };
    };
  }

  /** Attach validators exactly like your components do today */
  applyMobileValidators(
    control: AbstractControl,
    countryIso2?: string,
    required = false,
    minLength = 4,
    maxLength = 15,
  ): void {
    const validators = [
      ...(required ? [Validators.required] : []),
      Validators.pattern('^[0-9]*$'),
      Validators.minLength(minLength),
      Validators.maxLength(maxLength),
      this.optionalPhoneValidator(countryIso2)
    ];
    control.setValidators(validators);
    control.updateValueAndValidity({ emitEvent: false });
  }

  /** Full validity check used before submission */
  isPhoneValid(value: any, countryIso2: string, expectedLength: number): boolean {
    return (
      !!value &&
      isValidPhoneNumber(String(value), countryIso2 as CountryCode) &&
      String(value).length === expectedLength
    );
  }

  /** Normalize number (your current logic preserved) */
  normalizeNumber(value: any, countryIso2: string): string | number {
    try {
      return (
        parsePhoneNumberFromString(String(value), countryIso2 as CountryCode)
          ?.nationalNumber || value
      );
    } catch {
      return value;
    }
  }
}
