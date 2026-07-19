import * as React from 'react';
import renderer from 'react-test-renderer';
import { MonoText } from '../StyledText';

describe('StyledText', () => {
  it('renders MonoText with SpaceMono font family', async () => {
    let component;
    await renderer.act(async () => {
      component = renderer.create(<MonoText>Test text</MonoText>);
    });
    const tree = component.toJSON();
    expect(tree).toMatchSnapshot();
    expect(tree.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: 'SpaceMono'
        })
      ])
    );
  });

  it('preserves additional styles passed as props', async () => {
    const customStyle = { color: 'red', fontSize: 16 };
    let component;
    await renderer.act(async () => {
      component = renderer.create(<MonoText style={customStyle}>Test text</MonoText>);
    });
    const tree = component.toJSON();
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
