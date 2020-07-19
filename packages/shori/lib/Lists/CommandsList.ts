import { Observable, ReplaySubject } from 'rxjs';
import { CommandData } from '../struct/options/CommandData';

const commandAddedSubject = new ReplaySubject<CommandData>();

export const commandMap = new Map<string, CommandData>();
export const commandAdded = (): Observable<CommandData> => commandAddedSubject.asObservable();
commandAddedSubject.subscribe(command => commandMap.set(command.name, command));

export function addCommand(command: CommandData): void {
	commandAddedSubject.next(command);
}
