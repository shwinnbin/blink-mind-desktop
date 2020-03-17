import debug from 'debug';
import { ipcRenderer, remote } from 'electron';
import { List } from 'immutable';
import * as React from 'react';
import { Component, useState } from 'react';
import { IpcChannelName, IpcType } from '../../common';
import { createBlinkMindController } from '../blink-mind-controller';
import { MindMap } from '../components';
import { TranslationFunction, useTranslation } from '../hooks';
import { FileModel, FilesWindowModel, setFileModel } from '../models';
import { getFileContent, saveFile, saveFileWithFileModel } from '../utils';
import { FocusMode } from '@blink-mind/core';

const log = debug('bmd:files-page');

export function FilesPage(props) {
  const t = useTranslation();
  //@ts-ignore
  const initWindowData = remote.getCurrentWindow().windowData;

  const [windowData] = useState(initWindowData);

  const nProps = {
    windowData,
    t
  };
  return <FilesPageInternal {...nProps} />;
}

interface Props {
  windowData: any;
  t: TranslationFunction;
}

interface State {
  filesWindowModel: FilesWindowModel;
}
export class FilesPageInternal extends Component<Props, State> {
  constructor(props) {
    super(props);

    const { windowData } = this.props;
    const fileModels = windowData.files.map(file => {
      const { id, path, themeKey } = file;
      const controller = createBlinkMindController(this.onChange(id));
      controller.run('pgv');
      let docModel = null;
      if (path == null) {
        controller.run('clickStat', { evtName: 'new_file' });
        docModel = controller.run('createNewDocModel', {
          controller,
          themeKey
        });
      } else {
        controller.run('clickStat', { evtName: 'open_file' });
        const content = getFileContent({ path });
        const obj = JSON.parse(content);
        docModel = controller.run('deserializeDocModel', { controller, obj });
      }
      return new FileModel({
        id,
        path,
        savedModel: path ? docModel : null,
        docModel,
        controller
      });
    });

    const filesWindowModel = new FilesWindowModel({
      files: List(fileModels),
      activeFileId: fileModels[0].id
    });

    this.state = {
      filesWindowModel
    };

    // log('this.state', this.state);
  }

  getActiveFileModel() {
    return this.state.filesWindowModel.getActiveFile();
  }

  // 菜单的save => MR_SAVE => onSave => RM_SAVE
  // 菜单save: 判断path 是否为null, 是：saveAs 不是：save

  onIpcMR = (e, arg) => {
    const { type } = arg;
    log('onIpcMR', type);
    switch (type) {
      case IpcType.MR_SAVE:
        this.onSave(e, arg);
        break;
      case IpcType.MR_UNDO:
        this.onUndo();
        break;
      case IpcType.MR_REDO:
        this.onRedo();
        break;
      case IpcType.MR_BEFORE_CLOSE_WINDOW:
        this.onBeforeCloseWindow();
        break;
      default:
        break;
    }
  };

  onSave = (e, { path, id }) => {
    log('onSave', path);
    const fileModel = this.state.filesWindowModel.getFile(id);
    const focusMode = fileModel.docModel.currentSheetModel.focusMode;
    log('fileModel.docModel.currentSheetModel.focusMode', focusMode);
    const content = fileModel.getContent();
    log('content', content);
    saveFile({ path, id, content });
    const newFileWindowModel = setFileModel(this.state.filesWindowModel, {
      id: id,
      docModel: fileModel.docModel,
      isSave: true
    });
    this.setState({ filesWindowModel: newFileWindowModel });
  };

  onUndo = () => {
    const fileModel = this.getActiveFileModel();
    const controller = fileModel.controller;
    const docModel = fileModel.docModel;
    controller.run('undo', { controller, docModel });
  };

  onRedo = () => {
    const fileModel = this.getActiveFileModel();
    const controller = fileModel.controller;
    const docModel = fileModel.docModel;
    controller.run('redo', { controller, docModel });
  };

  onBeforeCloseWindow = () => {
    const unsavedFiles = this.state.filesWindowModel
      .getUnsavedFiles()
      .toArray();
    if (unsavedFiles.length > 0) {
      const canceled = unsavedFiles.some(f => {
        const r = saveFileWithFileModel(f, this.props.t);
        return r === 'cancel';
      });
      if (!canceled) {
        remote.getCurrentWindow().destroy();
      }
    } else {
      remote.getCurrentWindow().destroy();
    }
  };

  componentDidMount() {
    ipcRenderer.on(IpcChannelName.MR_FILE_WINDOW, this.onIpcMR);
  }

  componentWillUnmount() {
    ipcRenderer.off(IpcChannelName.MR_FILE_WINDOW, this.onIpcMR);
  }

  onChange = fileModelId => (docModel, callback) => {
    log('onchange', fileModelId);
    const fileModel = this.state.filesWindowModel.getFile(fileModelId);
    const edited = fileModel.savedModel !== docModel;
    log('edited', edited);
    //@ts-ignore
    remote.getCurrentWindow().setTitleFlag({ edited });
    const changed = fileModel.docModel !== docModel;
    if (!changed) return;
    const newFileWindowModel = setFileModel(this.state.filesWindowModel, {
      id: fileModelId,
      docModel
    });

    this.setState(
      {
        filesWindowModel: newFileWindowModel
      },
      callback
    );
  };

  render() {
    const { filesWindowModel } = this.state;
    const files = filesWindowModel.files;
    if (files.size === 1) {
      const fileModel = files.get(0);
      const mindMapProps = {
        fileModel
      };

      log('renderFilePage', mindMapProps);

      return (
        <>
          <MindMap {...mindMapProps} />
        </>
      );
    }
  }
}
