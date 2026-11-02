import React from 'react';
import { Composition, Still } from 'remotion';
import { Promo, TOTAL } from './Promo';
import { FPS } from './theme';
import { OwnerPromo, OWNER_TOTAL } from './owner/OwnerPromo';
import { FPS as OWNER_FPS } from './owner/kit';
import { ReelsCover, ReelsPromo } from './owner/reels/ReelsPromo';
import { MobilePromo, MOBILE_TOTAL } from './mobile/MobilePromo';

export const Root: React.FC = () => (
  <>
    <Composition id="SabakHubPromo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="SabakHubOwner" component={OwnerPromo} durationInFrames={OWNER_TOTAL} fps={OWNER_FPS} width={1920} height={1080} />
    <Composition
      id="SabakHubOwnerReels"
      component={ReelsPromo}
      durationInFrames={OWNER_TOTAL}
      fps={OWNER_FPS}
      width={1080}
      height={1920}
      defaultProps={{ guides: false }}
    />
    <Still id="SabakHubOwnerReelsCover" component={ReelsCover} width={1080} height={1920} />
    <Composition id="SabakHubMobile" component={MobilePromo} durationInFrames={MOBILE_TOTAL} fps={OWNER_FPS} width={1920} height={1080} />
  </>
);
