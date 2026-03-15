declare module "html2pdf.js" {
  interface Options {
    margin?: number | [number, number, number, number];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: { unit?: string; format?: string; orientation?: string };
    pagebreak?: Record<string, unknown>;
  }

  interface Html2Pdf {
    set(opt: Options): Html2Pdf;
    from(el: HTMLElement | string): Html2Pdf;
    save(): Promise<void>;
    output(type: string): Promise<unknown>;
  }

  function html2pdf(): Html2Pdf;
  export = html2pdf;
}
