import { ReplaySubject } from 'rxjs';

export const clientInjectedSubject = new ReplaySubject<{ target: any; prop: string | symbol }>();
