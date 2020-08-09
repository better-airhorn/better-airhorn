import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'dotenv/config';
import { AppModule } from './app.module';
import { Config } from './Config';
import session from 'cookie-session';
import passport from 'passport';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.use(
		session({
			keys: Config.sessions.singingKeys,
			maxAge: Config.sessions.expires,
		}),
	);

	app.use(passport.initialize());
	app.use(passport.session());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
		}),
	);

	app.enableCors({
		origin: '*.chilo.space',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
	});
	await app.listen(5000);
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
