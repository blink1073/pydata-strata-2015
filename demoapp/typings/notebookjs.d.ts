
declare module 'notebookjs' {

  export
  class Notebook {
    constructor();

    render(): HTMLElement;
  }
  
  export
  class nb {
    constructor();

    parse(value: string): Notebook;
  }

}
