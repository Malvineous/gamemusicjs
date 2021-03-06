# gamemusic.js
Copyright 2010-2021 Adam Nielsen <<malvineous@shikadi.net>>  

This is a Javascript library that can read and write music files used by a
number of MS-DOS games from the 1990s.  This library is an attempt to provide
a unified interface for reading and writing many of these formats.

## Supported music formats

Converting between any supported formats is possible (essentially you are
opening a song in one format and then saving it again in a different format
without modifying it), however some manual intervention is usually required in
the form of replacing the instruments.  This is because a MIDI file for example,
can't play OPL2 or digitized PCM instruments.  Once the instruments are changed
to those supported by the target format, then the notes and effects (where
supported) are converted automatically.

Files in the following formats can be read and written:

* .dro: [DOSBox Raw OPL](http://www.shikadi.net/moddingwiki/DRO_Format)
* .imf: [id Software Music Format](http://www.shikadi.net/moddingwiki/IMF_Format)
* .mid: [Standard MIDI Format](http://www.shikadi.net/moddingwiki/MID_Format)
* .sbi: [SoundBlaster Instrument](http://www.shikadi.net/moddingwiki/SBI_Format)

## Installation as an end-user

If you wish to use the command-line `gamemus` utility to work with music files
directly, you can install the CLI globally on your system:

    npm install -g @camoto/gamemusic-cli

For Arch Linux users the AUR package `gamemusic-cli` is also available.

### Command line interface

The `gamemus` utility can be used to read and write music files in any
supported format.  Commands are specified one after the other as parameters.
Use the `--help` option to get a list of all the available commands.  Some
quick examples:

    # Convert a DOSBox raw OPL capture to MIDI format
    gamemus open example.dro save -t mus-mid-type1 output.mid

To get a list of supported file formats and the code names to identify them
with when saving files, run:

    gamemus --formats

## Installation as a dependency

If you wish to make use of the library in your own project, install it in the
usual way:

    npm install @camoto/gamemusic

See `cli/index.js` for example use.

## Installation as a contributor

If you would like to help add more file formats to the library, great!  Clone
the repo, and to get started:

    npm install

Run the tests to make sure everything worked:

    npm test

You're ready to go!  To add a new file format:

 1. Create a new file in the `formats/` folder for your format.
    Copying an existing file that covers a similar format will help
    considerably.
    
 2. Edit `formats/index.js` and add an `import` statement for your new file.
    
 3. Make a folder in `test/` for your new format and populate it with
    files similar to the other formats.  The tests work by creating
    a standard song with a handful of musical events in it, and comparing the
    result to what is inside this folder.
    
    You can either create these file by hand, with another utility, or if
    you are confident that your code is correct, from the code itself.  This is
    done by setting an environment variable when running the tests, which will
    cause the archive file produced by your code to be saved to a temporary
    file in the current directory:
    
        SAVE_FAILED_TEST=1 npm test -- -g mus-myformat
        cd test/mus-myformat/ && mv default.bin.failed_test_output default.bin

If your file format has any sort of compression or encryption, these algorithms
should go into the [gamecomp.js](https://github.com/Malvineous/gamecompjs)
project instead.  This is to make it easier to reuse the algorithms, as many of
them (particularly the compression ones) are used amongst many unrelated file
formats.  All the gamecomp.js algorithms are available to be used by any format
in this library.

During development you can test your code like this:

    # Read a sample song and list its details, with debug messages on
    $ DEBUG='gamemusic:*' ./bin/gamemus open -t mus-myformat example.dat list

    # Make sure the format is identified correctly or if not why not
    $ DEBUG='gamemusic:*' ./bin/gamemus identify example.dat

    # Run unit tests just for your format only
    npm test -- -g mus-myformat

If you use `debug()` rather than `console.log()` in your code then these
messages can be left in for future diagnosis as they will only appear when the
`DEBUG` environment variable is set correctly.

### Development tips

This is a list of some common issues and how they have been solved by some of
the format handlers:

##### Multiple related formats

* `mus-imf-idsoftware` has a number of different variants.  The common code is
  implemented in a base class, with multiple classes inheriting from that.
  Each child class is then considered an independent file format, although they
  ultimately share common code.
