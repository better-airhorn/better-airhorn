import fetch from 'node-fetch';
import { parse } from 'url';
import { videoFormat } from 'ytdl-core';

export async function getYoutubeContentSize(format: videoFormat): Promise<number> {
	const realUrl = parse(format.url);
	const r = await fetch(realUrl, { method: 'HEAD' });
	return parseInt(r.headers.get('content-length'), 10);
}
