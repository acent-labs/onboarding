import React, { useEffect, useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';
import { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import {
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  useCreateBlockNote,
} from '@blocknote/react';
import { filterSuggestionItems } from '@blocknote/core';
import { createSignedUrl, uploadKnowledgeObject } from '../services/knowledgeStorage';
import { useAuth } from '../contexts/AuthContext';

export interface KnowledgeEditorRef {
  getHtml: () => Promise<string>;
  setHtml: (html: string) => Promise<void>;
  insertLink: (text: string, href: string) => void;
  insertFileBlock: (name: string, url: string) => void;
  replaceBlocksFromHtml: (html: string) => Promise<void>;
}

type Props = {
  editorRef?: React.MutableRefObject<KnowledgeEditorRef | null>;
  onHtmlChange?: (html: string) => void;
  className?: string;
};

function getCurrentBlockId(editor: BlockNoteEditor<any, any, any>): string {
  try {
    return editor.getTextCursorPosition().block.id;
  } catch {
    return editor.document[0]?.id;
  }
}

export default function KnowledgeEditor({ editorRef, onHtmlChange, className }: Props) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const lastCursorBlockIdRef = useRef<string | null>(null);

  const editor = useCreateBlockNote(
    {
      initialContent: [{ type: 'paragraph', content: '' }],
      uploadFile: async (file: File) => {
        try {
          if (!user?.id) {
            throw new Error('로그인이 필요합니다.');
          }
          const stored = await uploadKnowledgeObject(file, user.id);
          return await createSignedUrl(stored);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : '이미지 업로드에 실패했습니다. (Storage 버킷/정책을 확인해주세요.)';
          console.error('[KnowledgeEditor] uploadFile failed:', error);
          window.alert(message);
          throw error;
        }
      },
    },
    [user?.id]
  );

  useEffect(() => {
    const unsubscribe = editor.onSelectionChange(() => {
      try {
        lastCursorBlockIdRef.current = editor.getTextCursorPosition().block.id;
      } catch {
        // ignore
      }
    });
    return unsubscribe;
  }, [editor]);

  // 이미지/파일 붙여넣기 시 커서 위치가 아닌 문서 끝에 붙는 케이스가 있어,
  // 업로드 시작 시점에 "삽입된 블록이 마지막 블록"이면 마지막 커서 블록 뒤로 재배치한다.
  useEffect(() => {
    const unsubscribe = editor.onUploadStart((blockId?: string) => {
      try {
        if (!blockId) return;
        const targetId = lastCursorBlockIdRef.current;
        if (!targetId || targetId === blockId) return;

        const doc = editor.document;
        if (!doc || doc.length === 0) return;
        const isLast = doc[doc.length - 1]?.id === blockId;
        if (!isLast) return;
        const targetExists = doc.some((b) => b.id === targetId);
        if (!targetExists) return;

        const inserted = editor.getBlock(blockId);
        if (!inserted) return;

        const partial: any = {
          id: inserted.id,
          type: inserted.type,
          props: inserted.props,
          content: inserted.content,
          children: inserted.children,
        };

        editor.removeBlocks([blockId]);
        editor.insertBlocks([partial], targetId, 'after');
      } catch (error) {
        console.warn('[KnowledgeEditor] Failed to reposition uploaded block:', error);
      }
    });
    return unsubscribe;
  }, [editor]);

  const api = useMemo<KnowledgeEditorRef>(() => {
    return {
      getHtml: async () => {
        return editor.blocksToHTMLLossy(editor.document);
      },
      setHtml: async (html: string) => {
        const blocks = editor.tryParseHTMLToBlocks(html);
        editor.replaceBlocks(editor.document, blocks);
      },
      replaceBlocksFromHtml: async (html: string) => {
        const blocks = editor.tryParseHTMLToBlocks(html);
        editor.replaceBlocks(editor.document, blocks);
      },
      insertLink: (text: string, href: string) => {
        const reference = getCurrentBlockId(editor);
        editor.insertBlocks(
          [
            {
              type: 'paragraph',
              content: [{ type: 'link', href, content: text }],
            },
          ],
          reference,
          'after'
        );
        editor.setTextCursorPosition(reference, 'end');
      },
      insertFileBlock: (name: string, url: string) => {
        const reference = getCurrentBlockId(editor);
        editor.insertBlocks(
          [
            {
              type: 'file',
              props: { name, url },
            },
          ],
          reference,
          'after'
        );
        editor.setTextCursorPosition(reference, 'end');
      },
    };
  }, [editor]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = api;
    return () => {
      editorRef.current = null;
    };
  }, [api, editorRef]);

  const handleChange = async () => {
    if (!onHtmlChange) return;
    const html = await editor.blocksToHTMLLossy(editor.document);
    onHtmlChange(html);
  };

  return (
    <div className={className}>
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme={theme === 'dark' ? 'dark' : 'light'}
        className="h-full flex flex-col"
        style={{ height: '100%' }}
        contentEditableProps={{
          style: {
            flex: 1,
            minHeight: '100%',
            height: '100%',
          },
        }}
        formattingToolbar={false}
        slashMenu={false}
      >
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              {...getFormattingToolbarItems()}
            </FormattingToolbar>
          )}
        />

        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems([...getDefaultReactSlashMenuItems(editor)], query)
          }
        />
      </BlockNoteView>
    </div>
  );
}
