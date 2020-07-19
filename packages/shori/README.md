## Shori
Simple Typescript discord.js framework providing decorators and DI

---

### Should I use this?

probably not.

### Usage

Start by extending the ShoriClient, like this:

``` ts
class ExampleClient extends ShoriClient {

  constructor(shoriOptions: ShoriOptions, clientOptions: ClientOptions) {
    super(shoriOptions, clientOptions);
  }

  public getPrefix(id: string): Promise<string> {
    // should make a database request here
    // returning undefined will make it use the default prefix
    return undefined;
  }
  
}
```

#### Commands

Commands have to extend the `CommandBase` class and have the `Command` Decorator

``` ts
@Command('test')
class TestCommand extends CommandBase {

  // shori provide dependency injection with tsyringe
  // on how to provide a service, read down below in the Service chapter
  constructor(private fileService: FileService) {super();}

  public async exec(message: Message, args: string[]): Promise<any> {
    message.reply( `hi, this works. My Prefix: ${this.client.prefix}` );
  }

}
```

### Services

A Service is a class that provides methods and actions for your project, for example a class that provides methods to interact with the filesystem, you dont want that logic inside your commands.

``` ts
@Service()
export class FileService {

  public async init(): Promise<void> {
    // run things that your service needs to fully work,
    // this method will be called and awaited before the client starts
    // e.g. creating database connections, ensuring folders etc...
    await this.doStuff();
  }
  
}
```

The `@Service()` decorator will make the class a singleton, and thus can be injected into commands (or any other knows class in the shori context)

Its important to know that every Service *must* be provided in the service array in the shori client options.

shori will then call every services init method and wait for its Promise to resolve before the client starts the connection to discord

#### Events

Events simply have to be decorated with an `Event` Decorator

``` ts
import {Client, Event} from 'shori';

export class SomeClass {

  // shori will inject the client  
  @Client() 
  private client: ExampleClient

  @Event('ready')
  ready(): void {
    console.log('client is ready');
    console.log(this.client.channels.size);
  }

}
```

**Warning:** \
shori will register every class you use `@Command` , `@Event` or `@Service` on as a singleton, do not create instances yourself, 
but use DI or container.resolve from tsyringe

