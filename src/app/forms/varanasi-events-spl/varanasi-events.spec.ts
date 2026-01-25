import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VaranasiEvents } from './varanasi-events';

describe('VaranasiEvents', () => {
  let component: VaranasiEvents;
  let fixture: ComponentFixture<VaranasiEvents>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VaranasiEvents]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VaranasiEvents);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
