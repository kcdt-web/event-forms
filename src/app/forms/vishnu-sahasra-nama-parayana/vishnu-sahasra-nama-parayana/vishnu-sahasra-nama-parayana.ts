
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
import { countries } from 'countries-list';

import { environment } from '../../../../environments/environment.prod';


import { ValidateMobileNumber } from '../../../services/validate-mobile-number/validate-mobile-number';
import { ValidateRecaptcha } from '../../../services/validate-recaptcha/validate-recaptcha';

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
  selector: 'app-vishnu-sahasra-nama-parayana',
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
  templateUrl: './vishnu-sahasra-nama-parayana.html',
  styleUrl: './vishnu-sahasra-nama-parayana.scss',
})
export class VishnuSahasraNamaParayana implements OnInit {
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
  noSlotsAvailable = false;

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
    private validateMobileNumber: ValidateMobileNumber,
    private validateRecaptcha: ValidateRecaptcha
  ) { }

  ngOnInit(): void {
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    this.initializeOptions();
    this.prepareCountries();

    const defaultCountry = this.getCountryByIso('IN');
    if (defaultCountry?.iso2) {
      this.mobileNumberMaxLength =
        this.validateMobileNumber.getPhoneMaxLength(defaultCountry.iso2);
    }

    this.initializeForm(defaultCountry);
    this.handleFormChanges();

  }

  /** Prevent accidental page exit */
  private hasUnsavedData(): boolean {
    if (!this.registerForm) return false;
    return this.registerForm.dirty && !this.registrationSuccess;
  }

  async loadSlotsAvailability() {
    const response = await fetch(environment.vsnpSlotsEdgeFunction);
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

      const anyAvailable = this.slots.some(
        s => s.registration_count < s.max_capacity
      );

      this.noSlotsAvailable = !anyAvailable;

      this.updateActivityValidators();
      this.enforceSlotConstraints();

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

      // 5) If 4 slots selected, disable ALL non-selected slots
      const updatedSelected = control.value || [];
      if (updatedSelected.length >= 4) {
        slots.forEach(slot => {
          if (!updatedSelected.includes(slot.id)) {
            slot.disabled = true;
          }
        });
      }

      // 6) Remove any selected slot that somehow became disabled
      const cleanedSelection = selectedIds.filter((id) => {
        const idx = slots.findIndex(s => s.id === id);
        return idx >= 0 && !slots[idx].disabled;
      });

      if (cleanedSelection.length !== selectedIds.length) {
        control.setValue(cleanedSelection, { emitEvent: false });
      }
    });
  }

  getSelectedCount(day: 'day1' | 'day2' | 'day3'): number {
    const activities = this.registerForm.get('activities')?.value;
    if (!activities) return 0;
    return (activities[day] || []).length;
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

    this.validateMobileNumber.applyMobileValidators(
      this.registerForm.get('mobile_number')!,
      defaultCountry?.iso2,
      true,
      this.mobileNumberMinLength,
      this.mobileNumberMaxLength
    );
  }

  private updateActivityValidators(): void {
    const activities = this.registerForm.get('activities') as FormGroup;

    if (!activities) return;

    if (this.noSlotsAvailable) {
      activities.clearValidators();
    } else {
      activities.setValidators([this.atLeastOneDaySelected()]);
    }

    activities.updateValueAndValidity({ emitEvent: false });
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

  /** Listen to main form changes */
  private handleFormChanges(): void {
    const mobileCtrl = this.registerForm.get('mobile_number')!;
    this.registerForm.get('country_code')!.valueChanges.subscribe((country: Country | null) => {

      if (!country) return;

      this.mobileNumberMaxLength =
        this.validateMobileNumber.getPhoneMaxLength(country.iso2);

      this.validateMobileNumber.applyMobileValidators(
        mobileCtrl,
        country.iso2,
        true,
        this.mobileNumberMinLength,
        this.mobileNumberMaxLength
      );

      mobileCtrl.updateValueAndValidity();
    });

    mobileCtrl.valueChanges.subscribe((value) => {
      const country: Country = this.registerForm.get('country_code')!.value;
      if (!country || mobileCtrl.pristine) return;

      const valid = this.validateMobileNumber.isPhoneValid(
        value,
        country.iso2,
        this.mobileNumberMaxLength
      );

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

  private isDisabledByCapacity(slot: Option): boolean {
    return slot.registration_count >= slot.max_capacity;
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
      // const verified = await this.validateRecaptcha.verifyRecaptcha();
      // if (!verified) {
      //   this.submissionError = '[EC-TVF] Verification failed';
      //   this.loading = false;
      //   this.cd.detectChanges();
      //   return;
      // }

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

    if (!mainCountry || !mainCountry.iso2) {
      mainMobile.setErrors({ invalidPhone: true });
      this.invalidPhoneNumber = true;
      this.mobileNumberErrorMsg = 'Invalid phone number.';
      this.registerForm.markAllAsTouched();
      this.scrollToFirstInvalidField();
      return;
    }

    const mainValid = this.validateMobileNumber.isPhoneValid(
      mainMobile.value,
      mainCountry.iso2,
      this.mobileNumberMaxLength
    );

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

    if (this.noSlotsAvailable) {
      /** Prepare payload */
      const mainData = {
        kcdt_member_id: this.registerForm.value.kcdt_member_id,
        full_name: this.registerForm.value.full_name,
        country_code: mainCountry?.iso2,
        mobile_number: mainMobile.value,
      };
      /** Call Edge Function */
      try {
        const resp = await fetch(environment.gayathriHavanamWaitlists, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mainData }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          const errorMsg = data.message || data.error || 'Registration failed';
          throw new Error(errorMsg);
        }

        this.registrationSuccess = true;
        this.scrollToTop();
      } catch (err: any) {
        this.scrollToTop();
        this.submissionError = 'Error joining waitlist. ' + (err?.message || 'Unknown error');
      }
    } else {
      /** Prepare payload */
      const mainData = {
        kcdt_member_id: this.registerForm.value.kcdt_member_id,
        full_name: this.registerForm.value.full_name,
        country_code: mainCountry?.iso2,
        mobile_number: mainMobile.value,
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
        if (!resp.ok || !data.success) {
          const errorMsg = data.message || data.error || 'Registration failed';
          throw new Error(errorMsg);
        }

        this.registrationSuccess = true;
        this.scrollToTop();
      } catch (err: any) {
        if (err?.message === "Selected slot(s) are no longer unavailable.") {
          this.submissionError = "Selected slot(s) are no longer unavailable.";
          const activitiesGroup = this.registerForm.get('activities') as FormGroup;
          activitiesGroup.reset({
            day1: [],
            day2: [],
            day3: []
          });
        } else {
          this.submissionError = 'Error saving registration: ' + (err?.message || 'Unknown error');
        }
        this.scrollToTop();
        this.loadSlotsAvailability();
      }
    }
  }
}
