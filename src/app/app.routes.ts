import { Routes } from '@angular/router';

import { VaranasiEvents } from './forms/varanasi-events/varanasi-events';
import { GayathriHavanam } from './forms/gayathri-havanam/gayathri-havanam';

export const routes: Routes = [
    {
        path: 'gayathri-havanam-registrations',
        component: GayathriHavanam
    },
    {
        path: 'varanasi-event-registrations',
        component: VaranasiEvents
    },
    {
        path: '',
        redirectTo: 'varanasi-event-registrations',
        pathMatch: 'full'
    }
];
