import { useCallback, useRef, useState } from 'react';
import { DropdownMenu, IconButton, Text } from '@astryxdesign/core';
import { Viewport } from './ui/Viewport';
import { ControlPanel } from './ui/ControlPanel';
import { DownloadIcon, PhotoIcon } from './ui/icons';
import { Pipeline } from './render/Pipeline';
import {
  ACCEPTED_TYPES,
  downloadBlob,
  exportFilename,
  loadImageFile,
  pixelsToBlob,
  type ExportFormat,
  type LoadedImage,
} from './io/image';
import { DEFAULT_PARAMS, type ParamKey, type Params } from './state/params';

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const pipelineRef = useRef<Pipeline | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPipelineReady = useCallback((pipeline: Pipeline) => {
    pipelineRef.current = pipeline;
  }, []);

  const onFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      const loaded = await loadImageFile(file);
      setImage((previous) => {
        previous?.bitmap.close();
        return loaded;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be opened.');
    }
  }, []);

  const setParam = useCallback((key: ParamKey, value: number) => {
    setParams((previous) => ({ ...previous, [key]: value }));
  }, []);

  async function handleExport(format: ExportFormat) {
    const pipeline = pipelineRef.current;
    if (!pipeline || !image || busy) return;

    const maxTexture = pipeline.renderer.capabilities.maxTextureSize;
    if (image.width > maxTexture || image.height > maxTexture) {
      setError(
        `This photo is ${image.width}×${image.height}, larger than the ${maxTexture}px limit your GPU reports. Resize it and try again.`,
      );
      return;
    }

    setBusy(format);
    setError(null);
    // Yield the task so the button can paint its busy state before the GPU
    // stalls. Deliberately not requestAnimationFrame — that never fires in a
    // background tab, which would hang the export instead of merely delaying it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const pixels = pipeline.renderToPixels(params, image.width, image.height);
      const blob = await pixelsToBlob(pixels, image.width, image.height, format);
      downloadBlob(blob, exportFilename(image.name, format));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Text type="label" weight="semibold">
            Emulsion
          </Text>
          <Text type="supporting" color="secondary">
            Cinestill 800T halation
          </Text>
        </div>

        <div className="topbar-actions">
          {image && (
            <Text type="supporting" color="secondary">
              {image.name} · {image.width}&#215;{image.height}
            </Text>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            hidden
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <IconButton
            label="Open photo"
            icon={<PhotoIcon />}
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          />
          {/* One icon rather than two: a second download glyph would be
              indistinguishable from the first, so the format is a choice inside
              the menu instead of a guess between identical buttons. */}
          <DropdownMenu
            hasChevron={false}
            button={{
              label: 'Export',
              icon: <DownloadIcon />,
              isIconOnly: true,
              variant: 'primary',
              size: 'sm',
              isLoading: busy !== null,
              isDisabled: !image || busy !== null,
              tooltip: 'Export',
            }}
            items={[
              { id: 'jpeg', label: 'Export JPEG', onClick: () => void handleExport('jpeg') },
              { id: 'png', label: 'Export PNG', onClick: () => void handleExport('png') },
            ]}
          />
        </div>
      </header>

      {error && (
        <div className="error-bar" role="alert">
          <Text type="supporting">{error}</Text>
        </div>
      )}

      <main className="workspace">
        <Viewport image={image} params={params} onPipelineReady={onPipelineReady} onFiles={onFiles} />
        <ControlPanel
          params={params}
          onChange={setParam}
          onReset={() => setParams(DEFAULT_PARAMS)}
          disabled={!image}
        />
      </main>
    </div>
  );
}
