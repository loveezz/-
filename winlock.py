from cProfile import label
from cgitb import text
from genericpath import exists
from symbol import import_as_name
from tkinter import   *
from tkinter import font
from tkinter import messagebox
from typing import Protocol
import time

def btn_click():
    k = ent.get()
    if k == 'ПАРОЛЬ':
        messagebox.showinfo(title = 'Успех',message= ' Windows  разблокирован \nНажмите  Ok')
        root.destroy()
    else:
         messagebox.showwarning(title= ' Ошибка',message= 'Неправильный пароль')
             
def exits():
    if ent.get() !=  'Пароль':
        messagebox.showwarning(title= ' Ошибка',message= 'Неправильный пароль')
root  = Tk()
root.title("Winlocker от илюшыыыыы")
root.geometry('800x600')
root ['bg'] = 'yellow'
root.protocol('WM_DELETE_WINDOW', exists)
Label(root, text = 'Введите пароль', font = 'Arial 25', bg = 'yellow', fg= 'white').pack()
ent = Entry(root, text  = '', font ='Arial 25', width=  15 )
ent.pack()
Button(root , text= 'Разблокировать', font= ' Arial 25', bg = 'purple', fg = 'white', command= btn_click).pack()
root.mainloop()