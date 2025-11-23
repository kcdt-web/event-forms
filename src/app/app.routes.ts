import { Routes } from '@angular/router';

import { VaranasiEvents } from './forms/varanasi-events/varanasi-events';

export const routes: Routes = [
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
