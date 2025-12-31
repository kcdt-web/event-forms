import { TestBed } from '@angular/core/testing';

import { VsnpRegistrations } from './vsnp-registrations';

describe('VsnpRegistrations', () => {
  let service: VsnpRegistrations;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VsnpRegistrations);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
