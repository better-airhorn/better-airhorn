import { LoggingEvents } from './events/LoggingEvents';
import { VoiceChannelRequestService } from './events/VoiceChannelRequestService';
import { FileCachingService } from './FileCachingService';
import { LocalizationService } from './LocalizationService';
import { MinIOService } from './MinIOService';
import { SoundCommandService } from './SoundCommandService';
import { SoundFilesManager } from './SoundFilesManager';
import { StatisticsService } from './StatisticsService';

/**
 * List of Services that purely exists for events
 */
const ServicesForEvents: any[] = [LoggingEvents, VoiceChannelRequestService];

/**
 * List of real Services
 */
const RealServices: any[] = [
	FileCachingService,
	MinIOService,
	SoundCommandService,
	SoundFilesManager,
	StatisticsService,
	LocalizationService,
];

/**
 * List of Services that need to be registered in the shori context
 */
export const services = ServicesForEvents.concat(RealServices);
