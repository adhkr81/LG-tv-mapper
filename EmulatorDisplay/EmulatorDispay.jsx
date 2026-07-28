import Bezel from "./components/Bezel";
// import Buttons from "./components/Buttons";
// import Scrolling from "./components/Scrolling";
import { useDispatch, useSelector } from "react-redux";
// import screens from "./screens.json";
import { useState, useEffect } from "react";
import Screen from "./components/Screen";
import Buttons from "./components/Buttons";
import Scrolling from "./components/Scrolling";
import BackButton from "./components/BackButton";

export default function EmulatorDisplay() {
  const assetsPath = useSelector((state) => state?.data?.assetsPath);
  const canvasSize = useSelector((state) => state.data?.doc?.settings?.canvas);
  const currentModel = useSelector((state) => state?.navigation?.model);
  const currentVersion = useSelector((state) => state.navigation?.version);
  const presets = useSelector((state) => state?.data?.doc?.presets);
  const emulator_data = useSelector((state) => state?.data?.doc?.emulator);
  const [emulator_initial, setEmulatorInitial] = useState(
    emulator_data?.[currentModel]
  );
  const [screens, setScreens] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(null);
  const [prevScrollPos, setPrevScrollPos] = useState({
    "all-settings_support-alt_long_background": 61,
    "all-settings_long_background": 66,
  });
  const [returnPressed, setReturnPressed] = useState(false);
  const [origin, setOrigin] = useState(null);

  const preset = currentScreen?.preset;
  const presetModel = currentScreen?.model;
  const currentPreset = presets?.[presetModel]?.[currentVersion]?.[preset];
  const bezelObj = presets?.[currentModel]?.[currentVersion]?.bezel;

  const screenObj = currentPreset?.screen;
  const scrollObj = currentPreset?.scroll;
  const transform =
    currentModel !== presetModel || currentPreset?.transform?.[currentModel]
      ? currentPreset?.transform?.[currentModel]
      : false;

  const updateCurrentScreen = (name) => {
    setCurrentScreen({
      key: name,
      ...screens?.[name],
    });
  };

  useEffect(() => {
    setReturnPressed(false);
  }, [currentScreen]);

  useEffect(() => {
// There are repeated navigation paths, and depending on where the user starts, 
// the return buttons need to change. This is a simpler way to track the origin 
// instead of duplicating lots of images and data in screens.json.
    if (currentScreen?.track_origin) {
      setOrigin(currentScreen.key);
    }
  }, [currentScreen]);

  useEffect(() => {
    if (!screens) {
      const path = document.getElementById("root").getAttribute("data-path");
      fetch(
        `${path}/data/simulator/${currentModel}/${currentVersion}/screens.json`
      )
        .then((r) => {
          return r.json();
        })
        .then(async (data) => {
          setScreens(data);
        });
    } else {
      setCurrentScreen({
        key: emulator_data[currentModel][currentVersion].initial,
        ...screens[emulator_data[currentModel][currentVersion].initial],
      });
    }
  }, [screens, currentModel, currentVersion]);

  useEffect(() => {
    setEmulatorInitial(emulator_data?.[currentModel]);
  }, [currentModel, currentVersion]);

  if (!screens || !emulator_initial) return null;
  return (
    <div
      style={{
        position: "relative",
        height: canvasSize.height,
        width: canvasSize.width,
      }}
    >
      {bezelObj && !bezelObj.false ? (
        <Bezel bezelObj={bezelObj} assetsPath={assetsPath} />
      ) : null}
      <div
        style={{
          height: "100%",
          width: "100%",
          transform: transform
            ? `${
                transform.scale
                  ? `scale(${transform.scale}) translate(${
                      transform.translateX || 0
                    }px, ${transform.translateY || 0}px)`
                  : ""
              }`
            : "none",
          position: "absolute",
          zIndex: 3,
        }}
      >
        <div
          style={{
            position: "relative",
            height: "100%",
            width: "100%",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: screenObj?.top,
              left: screenObj?.left,
              height: screenObj?.height,
              width: screenObj?.width,
            }}
          >
            <Buttons
              data={currentScreen?.buttons}
              updateCurrentScreen={updateCurrentScreen}
              setReturnPressed={setReturnPressed}
              currentScreen={currentScreen}
              screens={screens}
              origin={origin}
            />
          </div>
        </div>
        {scrollObj && currentScreen?.scroll_area ? (
          <Scrolling
            currentVersion={currentVersion}
            scrollObj={scrollObj}
            currentScreen={currentScreen}
            data={currentScreen?.scroll_area}
            updateCurrentScreen={updateCurrentScreen}
            assetsPath={assetsPath}
            prevScrollPos={prevScrollPos}
            setPrevScrollPos={setPrevScrollPos}
            returnPressed={returnPressed}
            setReturnPressed={setReturnPressed}
            currentPreset={currentPreset}
          />
        ) : null}

        {currentScreen && screenObj && (
          <>
            <Screen
              currentVersion={currentVersion}
              assetsPath={assetsPath}
              currentScreen={currentScreen}
              screenObj={screenObj}
              transformObj={transform}
            />
            <BackButton
              updateCurrentScreen={updateCurrentScreen}
              currentScreen={currentScreen}
              screens={screens}
              setReturnPressed={setReturnPressed}
              origin={origin}
            />
          </>
        )}
      </div>
    </div>
  );
}
