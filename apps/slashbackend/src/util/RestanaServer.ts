import { Protocol, Request, Service } from 'restana';
import { Server, ServerOptions, ServerRequestHandler } from 'slash-create';

export class RestanaServer extends Server {
	private readonly app: Service<Protocol.HTTP>;

	public constructor(app?: any, opts?: ServerOptions) {
		super(opts);
		this.app = app;
	}

	public addMiddleware(middleware: any) {
		this.app.use(middleware);
		return this;
	}

	public use(middleware: any) {
		return this.addMiddleware(middleware);
	}

	public set(setting: string, value: any) {
		throw new Error(`whoops, someone tried to use this!\n${JSON.stringify({ setting, value })}`);
	}

	public createEndpoint(path: string, handler: ServerRequestHandler) {
		this.app.post(path, (req: Request<Protocol.HTTP>, res: any) =>
			handler(
				{
					headers: req.headers,
					body: req.body,
					request: req,
					response: res,
				},
				async response => {
					res.send(response.body, response.status || 200, response.headers);
				},
			),
		);
	}

	public async listen() {
		// do nothing
	}
}
