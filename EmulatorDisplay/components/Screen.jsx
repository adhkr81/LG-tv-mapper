export default function Screen({
  assetsPath,
  currentScreen,
  screenObj,
  screenTransform,
  currentVersion,
}) {
  
  return (
    <div
      style={{
        position: "absolute",
        borderRadius: screenObj.borderRadius,
        height: screenObj.height,
        width: screenObj.width,
        top: screenObj.top,
        left: screenObj.left,
        userSelect: "none",
      }}
      id="screen_img"
    >
      <img
        draggable={false}
        id="screen_image"
        src={`${assetsPath}/images/screens/emulator/${currentVersion}/${currentScreen.key}.jpg`}
        style={{
          position: "absolute",
          borderRadius:
            screenTransform && screenTransform.borderRadius
              ? screenTransform.borderRadius
              : screenObj.borderRadius,
          height: screenObj.height,
          width: screenObj.width,
          top: 0,
          left: 0,
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
        alt="screen"
      />
    </div>
  );
}
