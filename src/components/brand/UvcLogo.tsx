import React, {useId} from 'react';
import Svg, {Defs, Filter, FeColorMatrix, Image} from 'react-native-svg';

/** Recolor the neutral lettering only; preserve the supplied artwork, alpha,
 * and original #2bb442 checkmark. No opaque tile is added in dark mode. */
export function UvcLogo({dark, width = 76}: {dark: boolean; width?: number}) {
  const id = `uvc-logo-${useId().replace(/:/g, '')}`;
  const green = [43, 180, 66];
  const light = [228, 232, 236];
  const matrix = light.flatMap((value, channel) => {
    const factor = (value - green[channel]) / (green[1] - green[0]);
    return [factor, -factor, 0, 0, value / 255];
  }).concat([0, 0, 0, 1, 0]);
  const colorSpace = {colorInterpolationFilters: 'sRGB'};
  return <Svg width={width} height={width * 332 / 730} viewBox="0 0 730 332" accessibilityRole="image" accessibilityLabel="UVC">
    <Defs><Filter id={id} {...colorSpace}><FeColorMatrix type="matrix" values={matrix.join(' ')} /></Filter></Defs>
    <Image href={require('../../assets/images/uvc-logo.png')} width={730} height={332} filter={dark ? `url(#${id})` : undefined} />
  </Svg>;
}
