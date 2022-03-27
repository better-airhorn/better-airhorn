import { Response } from 'node-fetch';

export class ResponseError extends Error {
	public constructor(public readonly status: number, public readonly body: string) {
		super(`${status} ${body}`);
	}
}

export async function createResponseError(req: Response) {
	const { status, statusText } = req;
	try {
		const body = await req.text();
		return new ResponseError(status, body);
	} catch (e) {
		return new ResponseError(status, statusText);
	}
}
