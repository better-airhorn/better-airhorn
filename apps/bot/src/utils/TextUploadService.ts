import { Service } from '@better-airhorn/shori';
import fetch from 'node-fetch';

@Service()
export class TextUploadService {
	public readonly base = 'https://code.chilo.space';

	public async upload(text: string): Promise<string | null> {
		const res = await fetch(`${this.base}/api/upload`, {
			method: 'POST',
			body: text,
			headers: {
				'Content-Type': 'text/plain',
			},
		}).then(r => r.json());
		return `${res.hash}#${res.key}` ?? null;
	}
}
