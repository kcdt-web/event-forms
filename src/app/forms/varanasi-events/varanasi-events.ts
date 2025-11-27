import {
  Component,
  ChangeDetectorRef,
  OnInit,
  ElementRef,
  HostListener,
} from '@angular/core';
import { RouterOutlet, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormArray,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ButtonModule } from 'primeng/button';
import { ReCaptchaV3Service } from 'ng-recaptcha';
import { countries } from 'countries-list';
import {
  CountryCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  getExampleNumber,
} from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';
import { firstValueFrom, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment.prod';

interface Country {
  name: string;
  iso2: string;
  phoneCode: string;
  displayName: string;
}

interface Option {
  name: string;
  value: string;
}

@Component({
  selector: 'app-varanasi-events',
  templateUrl: './varanasi-events.html',
  styleUrls: ['./varanasi-events.scss'],
  imports: [
    RouterOutlet,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FloatLabelModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    ButtonModule,
  ],
})
export class VaranasiEvents implements OnInit {
  registerForm!: FormGroup;
  countriesList: Country[] = [];
  genderOptions: Option[] = [];
  activityOptions: Option[] = [];
  invalidPhoneNumber = false;
  mobileNumberMinLength = 4;
  mobileNumberMaxLength = 15;
  mobileNumberErrorMsg = 'Invalid phone number.';
  loading = false;
  registrationSuccess = false;
  submissionError = '';
  submitted = false;
  isMobile = false;
  hideParent = false;
  private sub!: Subscription;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private el: ElementRef,
    private recaptchaV3Service: ReCaptchaV3Service,
    private router: Router, private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    // set initial value as well
    this.hideParent = this.router.url.includes('/search');
    this.sub = this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: NavigationEnd) => {
      const url = e.urlAfterRedirects ?? e.url;
      this.hideParent = url.includes('/search');
    });

    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    this.initializeOptions();
    this.prepareCountries();

    const defaultCountry = this.getCountryByIso('IN');
    this.updatePhoneLength(defaultCountry?.iso2);

    this.initializeForm(defaultCountry);
    this.handleFormChanges();
  }

  /** Prevent accidental page exit */
  private hasUnsavedData(): boolean {
    if (!this.registerForm) return false;
    return this.registerForm.dirty && !this.registrationSuccess;
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): string | undefined {
    if (this.hasUnsavedData()) {
      event.preventDefault();
      event.returnValue = '';
      return '';
    }
    return undefined;
  }

  /** Dropdown Options */
  private initializeOptions(): void {
    this.genderOptions = [
      { name: 'Male', value: 'Male' },
      { name: 'Female', value: 'Female' },
    ];

    this.activityOptions = [
      { name: 'Day 1 (14 Mar 2026) - Vishnu Sahasra Nama Parayanam', value: 'Day 1 - Vishnu Sahasra Nama Parayanam' },
      { name: 'Day 1 (14 Mar 2026) - Laksha Bilwarchana', value: 'Day 1 - Laksha Bilwarchana' },
      { name: 'Day 2 (15 Mar 2026) - Lalitha Sahasra Nama/Soundaryalahari Parayanam', value: 'Day 2 - Lalitha Sahasra Nama/Soundaryalahari Parayanam' },
      { name: 'Day 2 (15 Mar 2026) - Laksha Rudrakshaarchana & Rudraabhishekam', value: 'Day 2 - Laksha Rudrakshaarchana & Rudraabhishekam' },
      { name: 'Day 3 (16 Mar 2026) - Purnahuti', value: 'Day 3 - Purnahuti' },
    ];
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

  /** Main Form Init */
  private initializeForm(defaultCountry?: Country): void {
    this.registerForm = this.fb.group({
      kcdt_member_id: [null],
      full_name: [null, Validators.required],
      country_code: [defaultCountry || null, Validators.required],
      mobile_number: [null],
      gender: ['Male', Validators.required],
      activities: [[], this.minSelectedActivities(1)],
      accompanyingParticipants: this.fb.array([]),
    });

    /** Apply dynamic validators */
    this.setMobileValidators(
      this.registerForm.get('mobile_number')!,
      defaultCountry?.iso2,
      true
    );
  }

  /** Activities min selected */
  private minSelectedActivities(min = 1) {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      return Array.isArray(value) && value.length >= min
        ? null
        : { required: true };
    };
  }

  /** Participants array getter */
  get accompanyingParticipants(): FormArray {
    return this.registerForm.get('accompanyingParticipants') as FormArray;
  }

  /** Add participant row */
  addParticipant(): void {
    const defaultCountry = this.getCountryByIso('IN');

    const participant = this.fb.group({
      kcdt_member_id: [null],
      full_name: [null, Validators.required],
      country_code: [defaultCountry || null],
      mobile_number: [null],
      gender: ['Male', Validators.required],
      activities: [[], this.minSelectedActivities(1)],
    });

    const phoneCtrl = participant.get('mobile_number')!;

    /** Re-run validators on country change */
    participant.get('country_code')!.valueChanges.subscribe((country) => {
      if (!country) return;
      this.updatePhoneLength(country.iso2);
      this.setMobileValidators(phoneCtrl, country.iso2);
      phoneCtrl.updateValueAndValidity();
    });

    /** participant phone validation on blur */
    phoneCtrl.valueChanges.subscribe((value) => {
      const country = participant.get('country_code')!.value as Country | null;
      if (!country || phoneCtrl.pristine || !value) return;

      const valid = isValidPhoneNumber(String(value), country.iso2 as CountryCode) &&
        String(value).length === this.mobileNumberMaxLength;

      if (!valid) phoneCtrl.setErrors({ invalidPhone: true });
      else phoneCtrl.setErrors(null);
    });

    this.accompanyingParticipants.push(participant);
  }

  removeParticipant(index: number): void {
    if (window.confirm('Are you sure you want to remove this participant?')) {
      this.accompanyingParticipants.removeAt(index);
    }
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

  /** Scroll to first invalid input */
  private scrollToFirstInvalidField(): void {
    const firstInvalidControl: HTMLElement | null = this.el.nativeElement.querySelector(
      'form .ng-invalid.p-component'
    );
    if (firstInvalidControl) {
      const innerInput = firstInvalidControl.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select'
      );
      const focusableElement: HTMLElement = innerInput || firstInvalidControl;
      focusableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if ('focus' in focusableElement) (focusableElement as HTMLElement).focus({ preventScroll: true });
    }
  }

  /** Submit Form */
  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.loading = true;
    this.submissionError = '';
    this.cd.detectChanges();

    try {
      // 1) Run reCAPTCHA v3
      const token = await firstValueFrom(this.recaptchaV3Service.execute('submit'));
      if (!token) throw new Error('reCAPTCHA failed');

      // 2) Verify token on server (Edge Function)
      const verifyResp = await fetch(
        'https://blopfvarveykkggbpkfr.supabase.co/functions/v1/recaptcha-verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }
      );

      const verifyData = await verifyResp.json();
      if (!verifyResp.ok || !verifyData.success) {
        this.submissionError = '[EC-TVF] Verification failed';
        this.loading = false;
        this.cd.detectChanges();
        return;
      }

      // 3) Process form submission via Edge Function
      await this.processFormSubmission();
    } catch (err: any) {
      this.submissionError = '[EC-GE] ' + (err?.message || 'Unknown error');
    } finally {
      this.loading = false;
      this.scrollToTop();
      this.cd.detectChanges();
    }
  }

  resetForm(): void {
    const defaultCountry = this.getCountryByIso('IN');
    this.accompanyingParticipants.clear();
    this.initializeForm(defaultCountry);
    this.registrationSuccess = false;
    this.submissionError = '';
    this.submitted = false;
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** NEW: Process submission via Edge Function */
  private async processFormSubmission(): Promise<void> {
    const mainMobile = this.registerForm.get('mobile_number')!;
    const mainCountry: Country | null = this.registerForm.get('country_code')!.value;

    const mainValid =
      mainMobile.value &&
      mainCountry &&
      isValidPhoneNumber(String(mainMobile.value), mainCountry.iso2 as CountryCode) &&
      String(mainMobile.value).length === this.mobileNumberMaxLength;

    if (!mainValid) {
      mainMobile.setErrors({ invalidPhone: true });
      this.invalidPhoneNumber = true;
      this.mobileNumberErrorMsg = 'Invalid phone number.';
      this.registerForm.markAllAsTouched();
      this.scrollToFirstInvalidField();
      return;
    }

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.scrollToFirstInvalidField();
      return;
    }

    /** Validate participant phones */
    let validParticipants = true;
    this.accompanyingParticipants.controls.forEach((p) => {
      const mobileCtrl = p.get('mobile_number')!;
      const country: Country = p.get('country_code')!.value;
      if (mobileCtrl.value && country && !isValidPhoneNumber(String(mobileCtrl.value), country.iso2 as CountryCode)) {
        mobileCtrl.setErrors({ invalidPhone: true });
        validParticipants = false;
      }
    });

    if (!validParticipants) {
      this.scrollToFirstInvalidField();
      return;
    }

    /** Prepare payload */
    const mainData = {
      kcdt_member_id: this.registerForm.value.kcdt_member_id,
      full_name: this.registerForm.value.full_name,
      country_code: mainCountry?.iso2,
      mobile_number:
        parsePhoneNumberFromString(String(mainMobile.value), mainCountry.iso2 as CountryCode)?.nationalNumber || mainMobile.value,
      gender: this.registerForm.value.gender,
      activities: this.registerForm.value.activities,
    };

    const accompData = this.accompanyingParticipants.controls.map((p) => {
      let num = p.value.mobile_number;
      const country: Country = p.get('country_code')!.value;
      if (num && country) {
        try {
          num = parsePhoneNumberFromString(String(num), country.iso2 as CountryCode)?.nationalNumber || num;
        } catch { }
      }
      return {
        kcdt_member_id: p.value.kcdt_member_id,
        full_name: p.value.full_name,
        country_code: country.iso2,
        mobile_number: num,
        gender: p.value.gender,
        activities: p.value.activities,
      };
    });

    /** Call Edge Function */
    try {
      const resp = await fetch(environment.registerEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainData, accompData }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Registration failed');

      this.registrationSuccess = true;
      this.scrollToTop();
    } catch (err: any) {
      this.submissionError = 'Error saving registration: ' + (err?.message || 'Unknown error');
    }
  }
}
