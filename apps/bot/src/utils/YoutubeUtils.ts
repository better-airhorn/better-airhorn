import fetch from 'node-fetch';
import { parse } from 'url';
import { videoFormat } from 'ytdl-core';

export async function getYoutubeContentSize(format: videoFormat): Promise<number | void> {
	const realUrl = parse(format.url);
	const r = await fetch(realUrl, { method: 'HEAD' });
	const contentLength = r.headers.get('content-length');
	if (!contentLength) return undefined;
	return parseInt(contentLength, 10);
}
