import { SoundCommand } from '@better-airhorn/entities';
import { JobSSEUpdate } from '@better-airhorn/structures';
import { Response } from '@irreal/nestjs-sse';
import { Controller, Get, NotFoundException, Param, ParseIntPipe, Res } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { PlayQueueService } from '../../services/playQueue.service';

@Controller('play')
export class PlayController {
	public constructor(private readonly playQueue: PlayQueueService) {}

	@Get('updates/:id')
	public async getJobUpdates(@Res() res: Response, @Param('id', ParseIntPipe) job: number) {
		await pushUpdates(res, job, this.playQueue);
	}

	@Get('test')
	public async test() {
		const data = await getRepository(SoundCommand).findOne(25);
		return this.playQueue
			.add({
				channel: '705804977347756084',
				duration: data.duration,
				guild: '631198410212376620',
				sound: data.id,
				user: '196214245770133504',
			})
			.then(j => j.id);
	}
}

async function pushUpdates(res: Response, job: number, playService: PlayQueueService): Promise<void> {
	const clearMethod = await playService
		.progress(job.toString(), async (progress, shouldClose, error) => {
			if (res.finished || res.destroyed || !res.writable) return;
			if (shouldClose) {
				res.sse(
					`data: ${JSON.stringify({ close: true, err: error, job: job, progress: progress } as JobSSEUpdate)}\n\n`,
				);
				res.end();
				return;
			}
			res.sse(
				`data: ${JSON.stringify({ close: false, err: error, job: job, progress: progress } as JobSSEUpdate)}\n\n`,
			);
		})
		.catch(err => {
			throw new NotFoundException(err.message);
		});

	return Promise.race([
		new Promise(ok => res.once('close', ok)),
		new Promise(ok => res.once('finish', ok)),
		new Promise(ok => res.once('error', ok)),
	]).then(() => clearMethod());
}
