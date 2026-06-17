%%
%% spe.cls - Minimal Wiley SPE (Software: Practice and Experience) class
%% Based on Wiley journal formatting requirements for SPE
%% This is a compatibility shim for when the official Wiley class is unavailable.
%% For final production, replace with the official spe.cls from Wiley.
%%

\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{spe}[2024/01/01 Wiley SPE compatibility class]

% Base on article
\LoadClass[11pt,a4paper]{article}

% --- Page Layout ---
\RequirePackage[margin=2.5cm,headsep=12pt,headheight=14pt]{geometry}

% --- Spacing ---
\RequirePackage{setspace}
\onehalfspacing

% --- Headers and footers ---
\RequirePackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small\textit{Software: Practice and Experience}}
\fancyhead[R]{\small\thepage}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0pt}

% For title page
\fancypagestyle{titlepage}{
  \fancyhf{}
  \renewcommand{\headrulewidth}{0pt}
  \renewcommand{\footrulewidth}{0pt}
}

% --- Font encoding ---
\RequirePackage[T1]{fontenc}
\RequirePackage{lmodern}

% --- Math ---
\RequirePackage{amsmath,amssymb,amsthm}

% --- Graphics ---
\RequirePackage{graphicx}
\RequirePackage{xcolor}

% --- Tables ---
\RequirePackage{booktabs}
\RequirePackage{longtable}
\RequirePackage{array}
\RequirePackage{tabularx}

% --- Captions ---
\RequirePackage{caption}
\captionsetup{font=small,labelfont=bf}

% --- Hyperlinks ---
\RequirePackage[colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue]{hyperref}

% --- DOI and URL ---
\RequirePackage{url}
\RequirePackage{doi}

% --- Bibliography ---
\RequirePackage[numbers,sort&compress]{natbib}

% --- Listings ---
\RequirePackage{listings}

% --- Section formatting ---
\renewcommand\section{\@startsection{section}{1}{\z@}%
  {-12\p@ \@plus -4\p@ \@minus -4\p@}%
  {6\p@ \@plus 2\p@ \@minus 2\p@}%
  {\normalfont\large\bfseries}}

\renewcommand\subsection{\@startsection{subsection}{2}{\z@}%
  {-10\p@ \@plus -3\p@ \@minus -3\p@}%
  {4\p@ \@plus 1\p@ \@minus 1\p@}%
  {\normalfont\normalsize\bfseries}}

\renewcommand\subsubsection{\@startsection{subsubsection}{3}{\z@}%
  {-8\p@ \@plus -2\p@ \@minus -2\p@}%
  {3\p@ \@plus 1\p@ \@minus 1\p@}%
  {\normalfont\normalsize\itshape}}

% --- Title formatting ---
\renewcommand\maketitle{%
  \begin{center}%
    {\LARGE\bfseries \@title \par}%
    \vskip 1em%
    {\normalsize \@author \par}%
    \vskip 0.5em%
    {\small \@date \par}%
  \end{center}%
  \vskip 1em%
  \thispagestyle{titlepage}%
}

% --- Abstract formatting ---
\renewcommand\abstract{%
  \small
  \list{}{\rightmargin\leftmargin}%
  \item\relax}
\renewcommand\endabstract{\endlist}

\endinput
