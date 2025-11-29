import { TestBed } from '@angular/core/testing';

import { VaranasiEventsRegistrations } from './varanasi-events-registrations';

describe('RegisterParticipants', () => {
  let service: VaranasiEventsRegistrations;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VaranasiEventsRegistrations);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
