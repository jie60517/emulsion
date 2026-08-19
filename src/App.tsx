import { useCallback, useRef, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Banner } from '@astryxdesign/core/Banner';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, Layout } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { useToast } from '@astryxdesign/core/Toast';
import { Viewport } from './ui/Viewport';
import { ControlPanel } from './ui/ControlPanel';
import { Pipeline } from './render/Pipeline';
import { DownloadIcon, PaletteIcon, PhotoIcon } from './ui/icons';
import {
  ACCEPTED_TYPES,
  downloadBlob,
  exportFilename,
  loadImageFile,
  pixelsToBlob,
  type ExportFormat,
  type LoadedImage,
} from './io/image';
import { DEFAULT_PARAMS, PARAM_SPECS, type ParamKey, type Params } from './state/params';
import { findPreset, type Preset } from './state/presets';
import {
  DARK_ONLY_THEMES,
  THEMES,
  THEME_LABELS,
  applyTheme,
  chooseTheme,
  isDarkNow,
  loadScheme,
  loadTheme,
  type SchemeName,
  type ThemeName,
} from './state/theme';
import {
  buildShareUrl,
  clearShareParam,
  decodeShareState,
  deleteCustomLook,
  loadCustomLooks,
  lookToFile,
  parseLookFile,
  saveCustomLook,
  type CustomLook,
} from './state/persistence';

/** Read once, at module load: the address bar cannot change under us before the
 *  first render, and re-parsing it inside every state initialiser is waste. */
const SHARED = decodeShareState(window.location.search);

function paramsEqual(a: Params, b: Params): boolean {
  return PARAM_SPECS.every((spec) => a[spec.key] === b[spec.key]);
}

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [params, setParams] = useState<Params>(SHARED?.params ?? DEFAULT_PARAMS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [presetId, setPresetId] = useState<string | null>(SHARED?.presetId ?? null);
  const [intensity, setIntensity] = useState(SHARED?.intensity ?? 100);
  const [customLooks, setCustomLooks] = useState<CustomLook[]>(() => loadCustomLooks());
  const [theme] = useState<ThemeName>(() => loadTheme());
  const [scheme] = useState<SchemeName>(() => loadScheme());

  // Applied during render rather than in an effect: the attribute has to be on
  // the root before the browser paints, or the first frame flashes the wrong
  // theme.
  applyTheme(theme, scheme);
  const isDark = isDarkNow(theme, scheme);

  const toast = useToast();
  const pipelineRef = useRef<Pipeline | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lookInputRef = useRef<HTMLInputElement>(null);

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
    // The URL described a look that no longer matches what is on screen.
    clearShareParam();
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    setParams(preset.params);
    setPresetId(preset.id);
    clearShareParam();
  }, []);

  const applyCustom = useCallback((look: CustomLook) => {
    setParams(look.params);
    setPresetId(look.id);
    clearShareParam();
  }, []);

  // The applied look stays highlighted after manual edits, but says so — a
  // highlighted preset that no longer describes the image is a lie.
  const activeParams =
    findPreset(presetId)?.params ??
    customLooks.find((look) => look.id === presetId)?.params ??
    null;
  const hasDrifted = activeParams !== null && !paramsEqual(params, activeParams);
  const activeName =
    findPreset(presetId)?.name ??
    customLooks.find((look) => look.id === presetId)?.name ??
    'Custom look';

  const revertPreset = useCallback(() => {
    if (activeParams) setParams(activeParams);
  }, [activeParams]);

  const handleSaveLook = useCallback(
    (name: string) => {
      const saved = saveCustomLook(name, params);
      setCustomLooks(saved);
      const match = saved.find((look) => look.name.toLowerCase() === name.trim().toLowerCase());
      if (match) setPresetId(match.id);
      toast({ body: `Saved ${name.trim()}` });
    },
    [params, toast],
  );

  const handleDeleteLook = useCallback(
    (look: CustomLook) => {
      setCustomLooks(deleteCustomLook(look.id));
      setPresetId((current) => (current === look.id ? null : current));
      toast({ body: `Deleted ${look.name}` });
    },
    [toast],
  );

  const handleCopyLink = useCallback(async () => {
    const url = buildShareUrl({ params, intensity, presetId });
    try {
      await navigator.clipboard.writeText(url);
      toast({ body: 'Share link copied' });
    } catch {
      // Clipboard access is refused in plenty of contexts. The URL is still
      // useful, so put it in the address bar for the user to copy by hand
      // rather than failing silently.
      window.history.replaceState(null, '', url);
      toast({ body: 'Clipboard blocked. Link is in the address bar.', type: 'error' });
    }
  }, [params, intensity, presetId, toast]);

  const handleExportLookFile = useCallback(() => {
    const name = hasDrifted || !activeParams ? 'Custom look' : activeName;
    downloadBlob(
      lookToFile(name, params, intensity),
      `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.emulsion.json`,
    );
  }, [params, intensity, activeName, activeParams, hasDrifted]);

  const handleImportLookFile = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      try {
        const parsed = parseLookFile(await file.text());
        setError(null);
        setParams(parsed.params);
        setIntensity(parsed.intensity);
        setPresetId(null);
        clearShareParam();
        toast({ body: `Loaded ${parsed.name}` });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That look could not be read.');
      }
    },
    [toast],
  );

  async function handleExport(format: ExportFormat) {
    const pipeline = pipelineRef.current;
    if (!pipeline || !image || busy) return;

    const maxTexture = pipeline.renderer.capabilities.maxTextureSize;
    if (image.width > maxTexture || image.height > maxTexture) {
      setError(
        `${image.width}×${image.height} exceeds this GPU's ${maxTexture}px limit. Resize and retry.`,
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
      const pixels = pipeline.renderToPixels(params, image.width, image.height, {
        mix: intensity / 100,
      });
      const blob = await pixelsToBlob(pixels, image.width, image.height, format);
      downloadBlob(blob, exportFilename(image.name, format));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export failed.');
    } finally {
      setBusy(null);
    }
  }

  const topNav = (
    <TopNav
      label="Emulsion"
      heading={
        <Text type="label" weight="semibold">
          Emulsion
        </Text>
      }
      endContent={
        <HStack gap={1} vAlign="center">
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
          <input
            ref={lookInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void handleImportLookFile(e.target.files);
              e.target.value = '';
            }}
          />
          <DropdownMenu
            hasChevron={false}
            alignment="end"
            button={{
              label: 'Appearance',
              icon: <PaletteIcon />,
              isIconOnly: true,
              variant: 'ghost',
              size: 'sm',
              tooltip: 'Appearance',
            }}
            items={[
              ...THEMES.map((name) => ({
                id: name,
                label: `${THEME_LABELS[name]}${name === theme ? '  ·' : ''}`,
                onClick: () => chooseTheme(name, scheme),
              })),
              { id: 'divider', label: '—', isDisabled: true },
              {
                id: 'scheme',
                label: DARK_ONLY_THEMES.includes(theme)
                  ? 'Light mode'
                  : scheme === 'dark'
                    ? 'Switch to light'
                    : 'Switch to dark',
                isDisabled: DARK_ONLY_THEMES.includes(theme),
                onClick: () => chooseTheme(theme, scheme === 'dark' ? 'light' : 'dark'),
              },
            ]}
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
            alignment="end"
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
        </HStack>
      }
    />
  );

  return (
    <AppShell
      // 'elevated' (the default) wants a padded, rounded, floating content
      // surface. A photo tool needs the image edge-to-edge, so we take
      // 'section' instead — it is the variant that draws a real divider between
      // the nav and a full-bleed content area.
      variant="section"
      height="fill"
      contentPadding={0}
      topNav={topNav}
      banner={
        error ? (
          <Banner status="error" title={error} isDismissable onDismiss={() => setError(null)} />
        ) : undefined
      }
    >
      <Layout
        height="fill"
        padding={0}
        content={
          <Viewport
            image={image}
            params={params}
            intensity={intensity}
            onPipelineReady={onPipelineReady}
            onFiles={onFiles}
            onPickFile={() => fileInputRef.current?.click()}
            isDark={isDark}
          />
        }
        end={
          <ControlPanel
            params={params}
            onChange={setParam}
            onReset={() => {
              setParams(DEFAULT_PARAMS);
              setPresetId(null);
              setIntensity(100);
              clearShareParam();
            }}
            disabled={!image}
            activePresetId={presetId}
            hasDrifted={hasDrifted}
            intensity={intensity}
            onApplyPreset={applyPreset}
            onRevertPreset={revertPreset}
            onIntensityChange={(value) => {
              setIntensity(value);
              clearShareParam();
            }}
            customLooks={customLooks}
            onApplyCustom={applyCustom}
            onSaveLook={handleSaveLook}
            onDeleteLook={handleDeleteLook}
            onCopyLink={() => void handleCopyLink()}
            onExportFile={handleExportLookFile}
            onImportFile={() => lookInputRef.current?.click()}
          />
        }
      />
    </AppShell>
  );
}
