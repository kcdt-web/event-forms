import {
  Component,
  ChangeDetectorRef,
  ElementRef,
  OnInit
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

/* ======================= PRIME NG ======================= */
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { PanelModule } from 'primeng/panel';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';

/* ======================= DATA / SERVICES ======================= */
import { countries } from 'countries-list';
import { environment } from '../../../../environments/environment.prod';
import { ValidateMobileNumber } from '../../../services/validate-mobile-number/validate-mobile-number';
import { ValidateRecaptcha } from '../../../services/validate-recaptcha/validate-recaptcha';

/* ======================= INTERFACES ======================= */

/** Country dropdown structure */
interface Country {
  name: string;
  iso2: string;
  phoneCode: string;
  displayName: string;
}

/** Participant returned from search API */
interface Participant {
  id: number;
  registered_on: string;
  kcdt_member_id: number | null;
  full_name: string;
  activities: string[];
  status: boolean;
  country_code: string;
  mobile_number: string;
}

/** Slot option structure */
interface Option {
  id: number;
  day: number;
  slot_time: string;
  max_capacity: number;
  registration_count: number;
  disabled?: boolean;
}

/** Slot summary used for preview / print */
interface SlotSummaryRow {
  full_name: string;
  day1: string;
  day2: string;
  day3: string;
}

/* ======================= COMPONENT ======================= */

@Component({
  selector: 'app-gayathri-havanam',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FloatLabelModule,
    InputNumberModule,
    SelectModule,
    SelectButtonModule,
    PanelModule,
    ButtonModule,
    CheckboxModule,
    TagModule
  ],
  templateUrl: './gayathri-havanam.html',
  styleUrl: './gayathri-havanam.scss',
})
export class GayathriHavanam implements OnInit {

  /* ======================= FORMS ======================= */

  /** Search form for participant lookup */
  searchForm!: FormGroup;

  /** Slot selection form */
  primarySlots!: FormGroup;

  /** Existing registrations already saved */
  existingRegistrations: SlotSummaryRow[] = [];

  /* ======================= DATA ======================= */

  /** Country dropdown list */
  countriesList: Country[] = [];

  /** Slot availability per day */
  day1Slots: Option[] = [];
  day2Slots: Option[] = [];
  day3Slots: Option[] = [];

  /** Flag if all slots are filled */
  noSlotsAvailable = false;

  /** GH registrations (existing GH slots) */
  gh: any[] = [];

  /** Main participant from search */
  mainParticipant: Participant | null = null;

  /* ======================= UI STATE ======================= */

  submissionError = '';
  registrationSuccess = false;
  searching = false;
  saving = false;
  withdrawing = false;
  slotsSubmitted = false;
  isMobile = false;

  /* ======================= PHONE VALIDATION ======================= */

  mobileNumberMinLength = 4;
  mobileNumberMaxLength = 15;
  mobileNumberErrorMsg = '';
  invalidSearchNumber = false;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private el: ElementRef,
    private validateMobileNumber: ValidateMobileNumber,
    private validateRecaptcha: ValidateRecaptcha
  ) { }

  /* ======================= INIT ======================= */

  ngOnInit(): void {
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    this.prepareCountries();
    this.initializeSearchForm();
    this.handleSearchFormChanges();
    this.loadSlotsAvailability();
  }

  /* ======================= VALIDATORS ======================= */

  /** Ensures at least one day has slots selected */
  private atLeastOneSlotValidator(control: AbstractControl): ValidationErrors | null {
    const day1 = control.get('day1')?.value || [];
    const day2 = control.get('day2')?.value || [];
    const day3 = control.get('day3')?.value || [];

    return (day1.length || day2.length || day3.length)
      ? null
      : { noDaysSelected: true };
  }

  /* ======================= COUNTRIES ======================= */

  /** Prepare country list with phone codes */
  private prepareCountries(): void {
    this.countriesList = Object.entries(countries).map(([iso2, data]) => ({
      name: data.name,
      iso2,
      phoneCode: String(data.phone?.[0] || ''),
      displayName: `${data.name} (+${String(data.phone?.[0] || '')})`,
    }));
  }

  private getCountryByIso(iso2: string): Country | undefined {
    return this.countriesList.find(c => c.iso2 === iso2);
  }

  /* ======================= SEARCH FORM ======================= */

  /** Initialize participant search form */
  private initializeSearchForm(): void {
    const defaultCountry = this.getCountryByIso('IN');

    this.searchForm = this.fb.group({
      kcdt_member_id: [null, Validators.required],
      country_code: [defaultCountry || null, Validators.required],
      mobile_number: [null, Validators.required],
    });

    if (defaultCountry) {
      this.mobileNumberMaxLength =
        this.validateMobileNumber.getPhoneMaxLength(defaultCountry.iso2);
    }
  }

  /** Handle dynamic phone validation */
  private handleSearchFormChanges(): void {
    const mobileCtrl = this.searchForm.get('mobile_number')!;

    this.searchForm.get('country_code')!.valueChanges.subscribe((country: Country) => {
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
    });

    mobileCtrl.valueChanges.subscribe(value => {
      const country = this.searchForm.get('country_code')!.value;
      if (!country || mobileCtrl.pristine) return;

      const valid = this.validateMobileNumber.isPhoneValid(
        value,
        country.iso2,
        this.mobileNumberMaxLength
      );

      this.invalidSearchNumber = !valid;
      this.mobileNumberErrorMsg = valid ? '' : 'Invalid mobile number';
    });
  }

  /* ======================= SLOT LOADING ======================= */

  /** Load slot availability from backend */
  async loadSlotsAvailability(): Promise<void> {
    const resp = await fetch(environment.gayathriHavanamSlotsEdgeFunction);
    const data = await resp.json();

    const slots: Option[] = data.slots;

    this.day1Slots = slots.filter(s => s.day === 1)
      .map(s => ({ ...s, disabled: s.max_capacity === s.registration_count }));

    this.day2Slots = slots.filter(s => s.day === 2)
      .map(s => ({ ...s, disabled: s.max_capacity === s.registration_count }));

    this.day3Slots = slots.filter(s => s.day === 3)
      .map(s => ({ ...s, disabled: s.max_capacity === s.registration_count }));

    this.noSlotsAvailable =
      [...this.day1Slots, ...this.day2Slots, ...this.day3Slots]
        .every(s => s.disabled === true);

    this.cd.detectChanges();
    this.enforceSlotConstraints();
  }

  /* ======================= SEARCH ======================= */

  /** Search participant registration */
  async searchRegistration(): Promise<void> {
    if (this.searching) return;

    this.submissionError = '';
    this.invalidSearchNumber = false;
    this.searchForm.markAllAsTouched();
    if (this.searchForm.invalid) return;

    this.searching = true;
    this.cd.detectChanges();

    try {
      const resp = await fetch(environment.searchEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kcdt_member_id: this.searchForm.value.kcdt_member_id,
          mobile_number: this.searchForm.value.mobile_number,
          context: 'GH'
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || 'Participant not found');
      }

      this.mainParticipant = data.mainParticipant;
      this.existingRegistrations = data.existingRegistrations || [];
      this.gh = data.gh || [];
      this.initParticipantSlots();

    } catch (err: any) {
      this.submissionError = err.message || 'Search failed';
      this.scrollToTop();
    } finally {
      this.searching = false;
      this.cd.detectChanges();
    }
  }

  /* ======================= SLOT FORM ======================= */

  /** Initialize slot selection form */
  private initParticipantSlots(): void {
    this.primarySlots = this.fb.group({
      activities: this.fb.group(
        { day1: [[]], day2: [[]], day3: [[]] },
        { validators: this.atLeastOneSlotValidator }
      ),
    });

    const activities = this.primarySlots.get('activities') as FormGroup;

    ['day1', 'day2', 'day3'].forEach(day => {
      activities.get(day)?.valueChanges.subscribe(() => {
        activities.updateValueAndValidity({ emitEvent: false });
        this.enforceSlotConstraints();
      });
    });
  }

  /* ======================= SLOT RULES ======================= */

  /** Enforces adjacency, capacity, and max-slot rules */
  private enforceSlotConstraints(): void {
    if (!this.primarySlots) return;

    const activitiesGroup = this.primarySlots.get('activities') as FormGroup;
    const days: Array<'day1' | 'day2' | 'day3'> = ['day1', 'day2', 'day3'];

    days.forEach(day => {
      const control = activitiesGroup.get(day)!;
      const selectedIds: number[] = control.value || [];

      const slots =
        day === 'day1' ? this.day1Slots :
          day === 'day2' ? this.day2Slots :
            this.day3Slots;

      if (!slots.length) return;

      // Disable fully booked slots
      slots.forEach(s => {
        s.disabled = s.registration_count >= s.max_capacity;
      });

      // Find selected slot indices
      const selectedIdx = selectedIds
        .map(id => slots.findIndex(s => s.id === id))
        .filter(i => i >= 0)
        .sort((a, b) => a - b);

      // Helper to disable non-selected slot
      const disableIfNotSelected = (idx: number) => {
        if (idx < 0 || idx >= slots.length) return;
        if (!selectedIds.includes(slots[idx].id)) {
          slots[idx].disabled = true;
        }
      };

      // Prevent gaps
      for (let i = 0; i < selectedIdx.length - 1; i++) {
        if (selectedIdx[i + 1] - selectedIdx[i] === 2) {
          disableIfNotSelected(selectedIdx[i] + 1);
        }
      }

      // Prevent adjacency conflicts
      for (let i = 0; i < selectedIdx.length - 1; i++) {
        if (selectedIdx[i + 1] - selectedIdx[i] === 1) {
          disableIfNotSelected(selectedIdx[i] - 1);
          disableIfNotSelected(selectedIdx[i + 1] + 1);
        }
      }

      // Max 4 slots per day
      if (selectedIds.length >= 4) {
        slots.forEach(s => {
          if (!selectedIds.includes(s.id)) {
            s.disabled = true;
          }
        });
      }

      // Clean invalid selections
      const cleaned = selectedIds.filter(id => {
        const idx = slots.findIndex(s => s.id === id);
        return idx >= 0 && !slots[idx].disabled;
      });

      if (cleaned.length !== selectedIds.length) {
        control.setValue(cleaned, { emitEvent: false });
      }
    });
  }

  /* ======================= HELPERS ======================= */

  hasSlotError(form: FormGroup): boolean {
    return (
      this.slotsSubmitted &&
      form.get('activities')?.hasError('noDaysSelected') === true
    );
  }

  private scrollToTop(): void {
    setTimeout(() => document.scrollingElement!.scrollTop = 0, 0);
  }

  private scrollToFirstSlotError(): void {
    setTimeout(() => {
      const firstErrorEl = this.el.nativeElement.querySelector(
        '.slot-section .p-invalid, .slot-section .text-danger'
      );
      firstErrorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  /* ======================= SUMMARY ======================= */

  /** Slot summary for preview / print */
  get slotSummary(): SlotSummaryRow[] {
    if (!this.mainParticipant || !this.primarySlots) return [];

    const activities = this.primarySlots.get('activities')?.value;
    if (!activities) return [];

    const mapSlots = (ids: number[], slots: Option[]): string =>
      ids
        .map(id => slots.find(s => s.id === id)?.slot_time)
        .filter(Boolean)
        .join(', ');

    return [{
      full_name: this.mainParticipant.full_name,
      day1: mapSlots(activities.day1 || [], this.day1Slots),
      day2: mapSlots(activities.day2 || [], this.day2Slots),
      day3: mapSlots(activities.day3 || [], this.day3Slots),
    }];
  }

  /* ======================= SUBMIT ======================= */

  /** Submit slot selection to backend */
  async submitSlots(): Promise<void> {
    if (this.saving) return;

    this.slotsSubmitted = true;
    this.saving = true;
    this.submissionError = '';
    this.primarySlots.markAllAsTouched();

    if (this.primarySlots.invalid) {
      this.saving = false;
      this.cd.detectChanges();
      this.scrollToFirstSlotError();
      return;
    }

    try {
      const primary = this.primarySlots.getRawValue().activities;

      const resp = await fetch(environment.gayathriHavanamRegistrationEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: "REGISTER_GH",
          mainData: {
            kcdt_member_id: this.mainParticipant?.kcdt_member_id,
            source_reference: this.mainParticipant?.id,
            full_name: this.mainParticipant?.full_name,
            country_code: this.mainParticipant?.country_code,
            mobile_number: this.mainParticipant?.mobile_number,
            day1: primary.day1,
            day2: primary.day2,
            day3: primary.day3
          }
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.message || 'Slot saving failed');
      }

      this.registrationSuccess = true;
      this.scrollToTop();

    } catch (err: any) {
      this.submissionError = err.message || 'Failed to save slots';
      this.scrollToTop();
    } finally {
      this.saving = false;
      this.cd.detectChanges();
    }
  }

  /**
 * Triggers browser print for slot summary
 */
  printSummary(): void {
    window.print();
  }

  /**
 * Confirms with the user before removing existing GH slot registrations.
 * If confirmed, existing slots are deleted and user can reselect slots.
 */
  async confirmChangeSlots(): Promise<void> {
    // If no slots are available at all, changing slots makes no sense
    if (this.noSlotsAvailable) {
      return;
    }

    // Confirmation dialog
    const confirmed = window.confirm(
      'Your current slot selection will be removed.\n\n' +
      'You will need to select new slots, subject to availability.\n\n' +
      'Do you want to continue?'
    );

    // Stop if user cancels
    if (!confirmed) {
      return;
    }

    // Proceed with removal of existing GH registrations
    await this.removeExistingGh();
  }

  /**
 * Resets the entire form and clears all loaded participant and slot data.
 * Used when user wants to start over.
 */
  resetForm(): void {
    // Reset search form (member id, country, mobile)
    this.searchForm?.reset();

    // Reset slot selection form
    this.primarySlots?.reset();

    // Clear loaded participant data
    this.mainParticipant = null;
    this.existingRegistrations = [];
    this.gh = [];

    // Reset UI flags
    this.submissionError = '';
    this.registrationSuccess = false;
    this.slotsSubmitted = false;
    this.searching = false;
    this.saving = false;

    // Reset search form but keep country default
    const defaultCountry = this.getCountryByIso('IN');
    this.searchForm.reset({
      country_code: defaultCountry || null,
      mobile_number: null,
    });

    // Scroll back to top for clean UX
    this.scrollToTop();

    this.cd.detectChanges();
  }

  /**
 * Returns true if GH data already exists for the participant.
 * Used to conditionally show summary / change-slot UI.
 */
  get hasExistingGh(): boolean {
    return Array.isArray(this.gh) && this.gh.length > 0;
  }

  /**
 * Builds summary rows for existing GH registrations.
 * Used to display already-registered slot information.
 */
  get ghSummary(): SlotSummaryRow[] {
    if (!Array.isArray(this.gh) || this.gh.length === 0) {
      return [];
    }

    return this.gh.map(v => ({
      full_name: v.full_name,
      day1: v.day1 || '-',
      day2: v.day2 || '-',
      day3: v.day3 || '-',
    }));
  }

  /**
 * Removes existing GH registrations for the current participant
 * and re-initializes slot selection so the user can choose again.
 */
  private async removeExistingGh(): Promise<void> {
    try {
      this.saving = true;

      // Collect all source_reference IDs that need to be removed
      const sourceReferences = this.getAllSourceReferences();

      if (!sourceReferences.length) {
        throw new Error('No participants found for slot removal');
      }

      // Call backend to delete existing GH registrations
      const resp = await fetch(environment.gayathriHavanamRegistrationEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE_GH',
          source_reference: sourceReferences
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove slots');
      }

      // Clear frontend state after successful removal
      this.gh = [];
      this.existingRegistrations = [];
      this.registrationSuccess = false;
      this.slotsSubmitted = false;

      // Reinitialize slot selection and reload availability
      this.initParticipantSlots();
      await this.loadSlotsAvailability();

      this.scrollToTop();

    } catch (err: any) {
      this.submissionError = err.message || 'Failed to change slots';
    } finally {
      this.saving = false;
      this.cd.detectChanges();
    }
  }

  /**
   * Collects all source_reference IDs whose GH registrations
   * need to be removed. Currently this includes only the main participant,
   * but is future-safe if dependents are added later.
   */
  private getAllSourceReferences(): number[] {
    const refs: number[] = [];

    // Add main participant reference if available
    if (this.mainParticipant?.id) {
      refs.push(this.mainParticipant.id);
    }

    return refs;
  }

  /**
 * Confirms and fully withdraws the participant from Gayathri Havanam.
 * This removes existing slots and ends the flow.
 */
  async confirmWithdraw(): Promise<void> {
    const confirmed = window.confirm(
      'You are about to withdraw from Gayathri Havanam.\n\n' +
      'All your reserved slots will be permanently removed.\n\n' +
      'Do you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    await this.withdrawCompletely();
  }

  /**
 * Performs DELETE_GH and clears all GH-related state.
 * Unlike Change Slot, this does NOT reinitialize slot selection.
 */
  private async withdrawCompletely(): Promise<void> {
    try {
      this.withdrawing = true;
      this.submissionError = '';

      const sourceReferences = this.getAllSourceReferences();
      if (!sourceReferences.length) {
        throw new Error('No participant found for withdrawal');
      }

      const resp = await fetch(environment.gayathriHavanamRegistrationEdgeFunction, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE_GH',
          source_reference: sourceReferences
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Failed to withdraw');
      }

      this.resetForm();
      this.scrollToTop();

    } catch (err: any) {
      this.submissionError = err.message || 'Withdrawal failed';
      this.scrollToTop();
    } finally {
      this.withdrawing = false;
      this.resetForm();
      this.scrollToTop();
      this.cd.detectChanges();
    }
  }

  hasConsecutiveOrDisabledInBetween(day: 'day1' | 'day2' | 'day3'): boolean {
    const selectedIds: number[] = this.primarySlots.get('activities')?.get(day)?.value || [];
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

  getSelectedCount(day: 'day1' | 'day2' | 'day3'): number {
    const activities = this.primarySlots.get('activities')?.value;
    if (!activities) return 0;
    return (activities[day] || []).length;
  }
}
