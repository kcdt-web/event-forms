import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchRegistration } from './search-registration';

describe('SearchRegistration', () => {
  let component: SearchRegistration;
  let fixture: ComponentFixture<SearchRegistration>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchRegistration]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SearchRegistration);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
