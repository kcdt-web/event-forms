import {
  Component,
  ChangeDetectorRef,
  OnInit,
  ElementRef,
  HostListener,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
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
import { PanelModule } from 'primeng/panel';
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
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment.prod';

interface Country {
  name: string;
  iso2: string;
  phoneCode: string;
  displayName: string;
}

interface Option {
  id: number,
  day: number,
  slot_time: string,
  max_capacity: number,
  registration_count: number,
  remaining?: number
  disabled?: boolean
}

@Component({
  selector: 'app-gayathri-havanam',
  imports: [CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FloatLabelModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    PanelModule,
    ButtonModule],
  templateUrl: './gayathri-havanam.html',
  styleUrl: './gayathri-havanam.scss',
})
export class GayathriHavanam implements OnInit {
  registerForm!: FormGroup;
  countriesList: Country[] = [];
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

  day1Slots: Option[] = [];
  day2Slots: Option[] = [];
  day3Slots: Option[] = [];
  slots: any[] = [];

  private readonly MAX_SLOTS_PER_DAY: any = {
    day1: 4,
    day2: 4,
    day3: 4
  };
  private readonly MAX_CONSECUTIVE = 2;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private el: ElementRef,
    private recaptchaV3Service: ReCaptchaV3Service
  ) { }

  ngOnInit(): void {
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

  async loadSlotsAvailability() {
    const response = await fetch(environment.gayathriHavanamSlotsEdgeFunction);
    const result = await response.json();

    if (result.success) {
      // Keep slots exactly as received from DB
      this.slots = result.slots;

      // Group by day
      this.day1Slots = this.slots.filter(s => s.day === 1);
      this.day2Slots = this.slots.filter(s => s.day === 2);
      this.day3Slots = this.slots.filter(s => s.day === 3);

      [...this.day1Slots, ...this.day2Slots, ...this.day3Slots].forEach(s => {
        s.disabled = s.max_capacity === s.registration_count;
      });

      this.cd.detectChanges();
    }
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
    this.loadSlotsAvailability();
  }

  private enforceSlotConstraints(): void {
    const activitiesGroup = this.registerForm.get('activities')!;
    type DayKey = 'day1' | 'day2' | 'day3';
    const days: DayKey[] = ['day1', 'day2', 'day3'];

    days.forEach((day) => {
      const control = activitiesGroup.get(day)!;
      const selectedIds: number[] = control.value || [];

      const slots: Option[] =
        day === 'day1' ? this.day1Slots :
          day === 'day2' ? this.day2Slots :
            this.day3Slots;

      if (!slots || slots.length === 0) return;

      // 1) reset disabled based on capacity first
      slots.forEach(s => {
        s.disabled = s.registration_count >= s.max_capacity;
      });

      // 2) build selected indexes (sorted)
      const selectedIdx = selectedIds
        .map(id => slots.findIndex(s => s.id === id))
        .filter(i => i >= 0)
        .sort((a, b) => a - b);

      const markDisabledIfNotSelected = (index: number) => {
        if (index < 0 || index >= slots.length) return;
        const id = slots[index].id;
        if (!selectedIds.includes(id)) {
          slots[index].disabled = true;
        }
      };

      // 3) Disable middle slot when selecting 3 & 5 (index diff == 2)
      for (let i = 0; i < selectedIdx.length - 1; i++) {
        const a = selectedIdx[i];
        const b = selectedIdx[i + 1];

        if (b - a === 2) {
          markDisabledIfNotSelected(a + 1);
        }
      }

      // 4) Disable prev and next-around for consecutive pairs
      for (let i = 0; i < selectedIdx.length - 1; i++) {
        const current = selectedIdx[i];
        const next = selectedIdx[i + 1];

        if (next - current === 1) {
          markDisabledIfNotSelected(current - 1); // previous
          markDisabledIfNotSelected(next + 1);    // next after pair
        }
      }

      // 5) Remove any selected slot that somehow became disabled
      const cleanedSelection = selectedIds.filter((id) => {
        const idx = slots.findIndex(s => s.id === id);
        return idx >= 0 && !slots[idx].disabled;
      });

      if (cleanedSelection.length !== selectedIds.length) {
        control.setValue(cleanedSelection, { emitEvent: false });
      }

      // 6) NEW RULE — If 4 slots selected, disable ALL non-selected slots
      const updatedSelected = control.value || [];
      if (updatedSelected.length >= 4) {
        slots.forEach(slot => {
          if (!updatedSelected.includes(slot.id)) {
            slot.disabled = true;
          }
        });
      }
    });
  }

  getSelectedCount(day: 'day1' | 'day2' | 'day3'): number {
    const activities = this.registerForm.get('activities')?.value;
    if (!activities) return 0;
    return (activities[day] || []).length;
  }


  private convertToHour(slot: string): number {
    if (!slot) return -1;

    const match = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return -1;

    let hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;

    return hour + minutes / 60; // optional, returns fractional hour
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
      kcdt_member_id: [null, Validators.required],
      full_name: [null, Validators.required],
      country_code: [defaultCountry || null, Validators.required],
      mobile_number: [null],
      activities: this.fb.group(
        {
          day1: [[]],
          day2: [[]],
          day3: [[]]
        },
        { validators: [this.atLeastOneDaySelected()] }
      ),
    });

    /** Apply dynamic validators */
    this.setMobileValidators(
      this.registerForm.get('mobile_number')!,
      defaultCountry?.iso2,
      true
    );
  }

  /** Activities min selected */
  private atLeastOneDaySelected() {
    return (group: AbstractControl): ValidationErrors | null => {
      const day1 = group.get('day1')?.value || [];
      const day2 = group.get('day2')?.value || [];
      const day3 = group.get('day3')?.value || [];

      const anySelected =
        (day1 && day1.length > 0) ||
        (day2 && day2.length > 0) ||
        (day3 && day3.length > 0);

      return anySelected ? null : { noDaysSelected: true };
    };
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

    // Listen to each day's selectbutton changes
    const activitiesGroup = this.registerForm.get('activities')!;
    ['day1', 'day2', 'day3'].forEach(day => {
      activitiesGroup.get(day)?.valueChanges.subscribe(() => {
        activitiesGroup.updateValueAndValidity({ onlySelf: true, emitEvent: false });
        this.enforceSlotConstraints();
      });
    });

  }

  hasConsecutiveOrDisabledInBetween(day: 'day1' | 'day2' | 'day3'): boolean {
    const selectedIds: number[] = this.registerForm.get('activities')?.get(day)?.value || [];
    if (selectedIds.length === 0) return false;

    const slots: Option[] = day === 'day1' ? this.day1Slots
      : day === 'day2' ? this.day2Slots
        : this.day3Slots;

    const selectedIndexes = selectedIds
      .map(id => slots.findIndex(s => s.id === id))
      .filter(i => i >= 0)
      .sort((a, b) => a - b);

    // 1) Check for consecutive selection
    for (let i = 0; i < selectedIndexes.length - 1; i++) {
      if (selectedIndexes[i + 1] - selectedIndexes[i] === 1) return true;
    }

    // 2) Check for any disabled slot that is between selected slots
    for (let i = 0; i < selectedIndexes.length - 1; i++) {
      const start = selectedIndexes[i];
      const end = selectedIndexes[i + 1];
      if (end - start > 1) {
        // Check slots in between
        for (let j = start + 1; j < end; j++) {
          if (slots[j].disabled && !this.isDisabledByCapacity(slots[j])) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /** Optional: distinguish capacity-based disabled slots from selection-based */
  private isDisabledByCapacity(slot: Option): boolean {
    return slot.registration_count >= slot.max_capacity;
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
      this.cd.detectChanges();
    }
  }

  resetForm(): void {
    const defaultCountry = this.getCountryByIso('IN');
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

    /** Prepare payload */
    const mainData = {
      kcdt_member_id: this.registerForm.value.kcdt_member_id,
      full_name: this.registerForm.value.full_name,
      country_code: mainCountry?.iso2,
      mobile_number:
        Number(parsePhoneNumberFromString(String(mainMobile.value), mainCountry.iso2 as CountryCode)?.nationalNumber || mainMobile.value),
      day1: this.registerForm.value.activities.day1,
      day2: this.registerForm.value.activities.day2,
      day3: this.registerForm.value.activities.day3,
    };

    /** Call Edge Function */
    try {
      const resp = await fetch(environment.gayathriHavanamRegistrationEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainData }),
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
