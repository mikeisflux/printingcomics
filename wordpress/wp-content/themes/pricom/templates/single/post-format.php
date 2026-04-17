<?php 
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

$post_format = get_post_format();
switch ($post_format) {
    case false: // Standart post
        echo '<i class="fa fa-file"></i>';
        break;
    case 'aside':
        echo '<i class="fa fa-file-text"></i>';
        break;
    case 'image':
        echo '<i class="fa fa-file-image-o"></i>';
        break;
    case 'gallery':
        echo '<i class="fa fa-file-image-o"></i>';
        break;
    case 'video':
        echo '<i class="fa fa-file-video-o"></i>';
        break;
    case 'audio':
        echo '<i class="fa fa-music"></i>';
        break;
    case 'quote':
        echo '<i class="fa fa-quote-left"></i>';
        break;
    case 'link':
        echo '<i class="fa fa-link"></i>';
        break;
    
    default:
        echo '<i class="fa fa-file"></i>';
        break;
}