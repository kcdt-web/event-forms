import { TestBed } from '@angular/core/testing';

import { RegisterParticipants } from './register-participants';

describe('RegisterParticipants', () => {
  let service: RegisterParticipants;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RegisterParticipants);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
