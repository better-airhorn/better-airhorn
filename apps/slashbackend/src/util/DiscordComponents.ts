import { Subject } from 'rxjs';
import { ButtonStyle, CommandContext, ComponentContext, ComponentType } from 'slash-create';

export async function sendComponent(
	ctx: CommandContext,
	data: {
		content: string;
		button: {
			label: string;
			id: string;
			style: ButtonStyle.PRIMARY | ButtonStyle.SECONDARY | ButtonStyle.SUCCESS | ButtonStyle.DESTRUCTIVE;
		};
	},
) {
	await ctx.send(data.content, {
		components: [
			{
				type: ComponentType.ACTION_ROW,
				components: [
					{
						type: ComponentType.BUTTON,
						style: data.button.style,
						label: data.button.label,
						custom_id: data.button.label,
					},
				],
			},
		],
	});
	const subject = new Subject<ComponentContext>();
	ctx.registerComponent(data.button.id, async btnCtx => {
		subject.next(btnCtx);
	});

	return subject;
}
