import { ChangeDetectorRef, Component, OnInit, } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import {
  CountryCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  getExampleNumber,
} from 'libphonenumber-js';
import { countries } from 'countries-list';
import examples from 'libphonenumber-js/mobile/examples';

interface Country {
  name: string;
  iso2: string;
  phoneCode: string;
  displayName: string;
}

@Component({
  selector: 'app-search-registration',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FloatLabelModule, InputTextModule, InputNumberModule, SelectModule],
  templateUrl: './search-registration.html',
  styleUrl: './search-registration.scss',
})
export class SearchRegistration implements OnInit {
  registerForm!: FormGroup;
  countriesList: Country[] = [];
  invalidPhoneNumber = false;
  mobileNumberMinLength = 4;
  mobileNumberMaxLength = 15;
  mobileNumberErrorMsg = 'Invalid phone number.';
  loading = false;
  registrationSuccess = false;
  submissionError = '';
  submitted = false;
  isMobile = false;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    this.prepareCountries();
    const defaultCountry = this.getCountryByIso('IN');
    this.updatePhoneLength(defaultCountry?.iso2);
    this.initializeForm(defaultCountry);
    this.handleFormChanges();
  }

  /** Build Country List */
  private prepareCountries(): void {
    this.countriesList = Object.entries(countries).map(([iso2, data]) => ({
      name: data.name,
      iso2,
      phoneCode: String(data.phone?.[0] || ''),
      displayName: `${data.name} (+${String(data.phone?.[0] || '')})`,
    }));
  }

  private getCountryByIso(iso2: string): Country | undefined {
    return this.countriesList.find((c) => c.iso2 === iso2);
  }

  /** Dynamic phone length from example number */
  private updatePhoneLength(countryIso2?: string): void {
    if (!countryIso2) return;
    try {
      const example = getExampleNumber(countryIso2 as CountryCode, examples);
      const length = example?.nationalNumber?.length;
      this.mobileNumberMaxLength = length || 15;
    } catch {
      this.mobileNumberMaxLength = 15;
    }
  }

  /** Listen to main form changes */
  private handleFormChanges(): void {
    const mobileCtrl = this.registerForm.get('mobile_number')!;
    this.registerForm.get('country_code')!.valueChanges.subscribe((country: Country | null) => {
      if (!country) return;
      this.updatePhoneLength(country.iso2);
      this.setMobileValidators(mobileCtrl, country.iso2, true);
      mobileCtrl.updateValueAndValidity();
    });

    mobileCtrl.valueChanges.subscribe((value) => {
      const country: Country = this.registerForm.get('country_code')!.value;
      if (!country || mobileCtrl.pristine) return;

      const valid = isValidPhoneNumber(String(value), country.iso2 as CountryCode) &&
        String(value).length === this.mobileNumberMaxLength;

      this.invalidPhoneNumber = !valid;
      this.mobileNumberErrorMsg = valid ? '' : 'Invalid phone number.';
    });
  }

  private initializeForm(defaultCountry?: Country): void {
    this.registerForm = this.fb.group({
      kcdt_member_id: [null],
      country_code: [defaultCountry || null, Validators.required],
      mobile_number: [null]
    });

    /** Apply dynamic validators */
    this.setMobileValidators(
      this.registerForm.get('mobile_number')!,
      defaultCountry?.iso2,
      true
    );
  }

  /** Dynamically assign validators based on country selection */
  private setMobileValidators(control: AbstractControl, countryIso2?: string, required = false): void {
    const validators = [
      ...(required ? [Validators.required] : []),
      Validators.pattern('^[0-9]*$'),
      Validators.minLength(this.mobileNumberMinLength),
      Validators.maxLength(this.mobileNumberMaxLength),
      this.optionalPhoneValidator(countryIso2),
    ];
    control.setValidators(validators);
  }

  /** Allow empty phone but validate if present */
  private optionalPhoneValidator(countryIso2?: string) {
    return (control: AbstractControl) => {
      if (!control.value) return null;
      const valid = isValidPhoneNumber(String(control.value), countryIso2 as CountryCode);
      return valid ? null : { invalidPhone: true };
    };
  }

  onSubmit() { }
}
