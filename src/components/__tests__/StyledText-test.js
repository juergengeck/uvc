import * as React from 'react';
import renderer from 'react-test-renderer';
import { MonoText } from '../StyledText';

describe('StyledText', () => {
  it('renders MonoText with SpaceMono font family', () => {
    const tree = renderer.create(<MonoText>Test text</MonoText>).toJSON();
    expect(tree).toMatchSnapshot();
    expect(tree.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: 'SpaceMono'
        })
      ])
    );
  });

  it('preserves additional styles passed as props', () => {
    const customStyle = { color: 'red', fontSize: 16 };
    const tree = renderer.create(<MonoText style={customStyle}>Test text</MonoText>).toJSON();
    expect(tree.props.style).toEqual(
      expect.arrayContaining([
        customStyle,
        expect.objectContaining({
          fontFamily: 'SpaceMono'
        })
      ])
    );
  });
});
