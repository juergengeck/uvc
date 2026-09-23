import React, {useId} from 'react';
import {Asset} from 'expo-asset';

/** Use the original transparent artwork, changing neutral lettering only. */
export function UvcLogo({dark, width = 76}: {dark: boolean; width?: number}) {
  const id = `uvc-logo-${useId().replace(/:/g, '')}`;
  const green = [43, 180, 66];
  const light = [228, 232, 236];
  const matrix = light.flatMap((value, channel) => {
    const factor = (value - green[channel]) / (green[1] - green[0]);
    return [factor, -factor, 0, 0, value / 255];
  }).concat([0, 0, 0, 1, 0]);
  return <svg width={width} height={width * 332 / 730} viewBox="0 0 730 332" role="img" aria-label="UVC">
    <defs><filter id={id} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={matrix.join(' ')} /></filter></defs>
    <image href={Asset.fromModule(require('../../assets/images/uvc-logo.png')).uri} width={730} height={332} filter={dark ? `url(#${id})` : undefined} />
  </svg>;
}
