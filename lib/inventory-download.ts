const filename = "Inventar_ToyLogix.xlsx";
const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type SaveHandle = {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
};
type SaveWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveHandle>;
};

export async function downloadInventoryReport(createBuffer: () => Promise<ArrayBuffer | Uint8Array>) {
  let handle: SaveHandle | undefined;
  const browser = window as SaveWindow;
  if (browser.showSaveFilePicker) {
    try {
      // Open during the button gesture, before fetching data or loading ExcelJS.
      handle = await browser.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Registru Excel", accept: { [mimeType]: [".xlsx"] } }],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Embedded browsers can expose the API but prohibit it inside a frame.
      if (!(error instanceof DOMException) || error.name !== "SecurityError") throw error;
    }
  }
  const buffer = await createBuffer();
  const blob = new Blob([Uint8Array.from(new Uint8Array(buffer))], { type: mimeType });
  if (handle) {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_self";
  link.hidden = true;
  // Keep delegated navigation handlers from treating the download as a link.
  link.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
