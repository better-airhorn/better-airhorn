import { IsOptional, IsString, Length } from 'class-validator';
import { IsNotBlank } from '../structures/Validators';

export class GuildSettingDTO {
	@IsOptional()
	@IsString()
	@Length(1, 5)
	@IsNotBlank()
	public prefix?: string;
}
