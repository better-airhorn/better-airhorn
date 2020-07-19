import { Service } from '@better-airhorn/shori';
import fetch from 'node-fetch';

@Service()
export class TextUploadService {
	public readonly base = 'https://your.code.is.being-a.fail/';

	public async upload(text: string): Promise<string | null> {
		const res = await fetch(`${this.base}/api/upload`, {
			method: 'POST',
			body: text,
		})
			.then(r => r.json())
			.catch(Promise.reject);
		return `${res.hash}#${res.key}` ?? null;
	}
}
